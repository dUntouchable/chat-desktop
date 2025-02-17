import os
import asyncio
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from my_llama import LlamaLocalClient
from my_anthropic import AnthropicClient
from my_openai import OpenaiClient
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any
from queue import Queue, Empty
from threading import Thread
import json

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Load environment variables
load_dotenv()

system_prompt = "You are a helpful assistant."

clients = {
    'llama': LlamaLocalClient(system_prompt),
    'anthropic': AnthropicClient(os.environ.get("ANTHROPIC_API_KEY"), system_prompt),
    'openai': OpenaiClient(os.environ.get("OPENAI_API_KEY"), system_prompt)
}

response_map = {
    'llama': 'response1',
    'anthropic': 'response2',
    'openai': 'response3'
}

executor = ThreadPoolExecutor(max_workers=3)

async def get_selected_responses(message: str, active_windows: List[str] = None) -> Dict[str, Any]:    
    loop = asyncio.get_event_loop()
    selected_clients = active_windows if active_windows else list(clients.keys())

    
    async def process_response(client_id: str) -> tuple[str, str]:
        response_gen = await loop.run_in_executor(
            executor, 
            clients[client_id].update_messages, 
            message
        )
        # Convert generator to string if needed
        if hasattr(response_gen, '__iter__') and not isinstance(response_gen, (str, dict)):
            response_text = ''.join(chunk for chunk in response_gen)
        else:
            response_text = response_gen
        return response_text
    
    responses = await asyncio.gather(*[
        process_response(client_id) for client_id in selected_clients if client_id in clients
    ])
    
    return {
        response_map[client_id]: response
        for client_id, response in zip(selected_clients, responses)
    }

@app.route('/chat', methods=['GET'])
def chat():
    async def async_chat():
        try:
            message = request.args.get('message')
            active_windows = request.args.get('windows', '').split(',') if request.args.get('windows') else None
            
            if not message:
                return jsonify({
                    'error': 'Message parameter is required'
                }), 400
            if active_windows:
                active_windows = [w for w in active_windows if w in clients]
                if not active_windows:
                    return jsonify({
                        'error': 'No valid window IDs provided'
                    }), 400
            responses = await get_selected_responses(message, active_windows)
            return jsonify(responses)
        except Exception as e:
            print(f"Error in chat endpoint: {str(e)}")
            return jsonify({
                'error': 'Internal server error processing chat request'
            }), 500
    return asyncio.run(async_chat())


@app.route('/chat-stream', methods=['POST'])
def chat_stream():
    data = request.get_json()
    message = data.get('message')
    active_windows = data.get('windows', '') if data.get('windows') else None
    # message = request.args.get('message')
    # active_windows = request.args.get('windows', '').split(',') if request.args.get('windows') else None

    if not message:
        return jsonify({'error': 'Message parameter is required'}), 400

    if active_windows:
        active_windows = [w for w in active_windows if w in clients]
        if not active_windows:
            return jsonify({'error': 'No valid window IDs provided'}), 400

    def generate():
        queues = {client_id: Queue() for client_id in active_windows or clients.keys()}

        def process_model(client_id):
            try:
                for chunk in clients[client_id].update_messages(message):
                    queues[client_id].put((client_id, chunk))
            except Exception as e:
                queues[client_id].put((client_id, f"Error: {str(e)}"))
            finally:
                queues[client_id].put((client_id, None))  # Signal completion

        # Start threads for each model
        threads = []
        for client_id in (active_windows or clients.keys()):
            thread = Thread(target=process_model, args=(client_id,))
            thread.start()
            threads.append(thread)

        active_models = set(active_windows or clients.keys())
        while active_models:
            for client_id in list(active_models):
                queue = queues[client_id]
                try:
                    model_id, chunk = queue.get_nowait()
                    if chunk is None:
                        active_models.remove(client_id)
                    else:
                        response_data = {
                            'model': response_map[model_id],
                            'chunk': chunk
                        }
                        yield f"data: {json.dumps(response_data)}\n\n"
                except Empty:
                    continue

    return Response(stream_with_context(generate()), 
                   mimetype='text/event-stream',
                   headers={'Cache-Control': 'no-cache',
                           'Transfer-Encoding': 'chunked'})


if __name__ == '__main__':
    app.run(debug=True)