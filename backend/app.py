import os
import asyncio
from flask import Flask, request, jsonify
from flask_cors import CORS
from my_llama import LlamaLocalClient
from my_anthropic import AnthropicClient
from my_openai import OpenaiClient
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any
from asgiref.wsgi import WsgiToAsgi
from hypercorn.config import Config
from hypercorn.asyncio import serve

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

executor = ThreadPoolExecutor(max_workers=3)

async def get_selected_responses(message: str, active_windows: List[str] = None) -> Dict[str, Any]:    
    loop = asyncio.get_event_loop()
    selected_clients = active_windows if active_windows else list(clients.keys())
    
    tasks = [
        loop.run_in_executor(executor, clients[client_id].update_messages, message)
        for client_id in selected_clients
        if client_id in clients
    ]
    
    responses = await asyncio.gather(*tasks)
    
    response_map = {
        'llama': 'response1',
        'anthropic': 'response2',
        'openai': 'response3'
    }
    
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

if __name__ == '__main__':
    app.run(debug=True)