import os
import asyncio
from flask import Flask, request, jsonify
from flask_cors import CORS
from my_llama import LlamaClient, LlamaLocalClient
from my_anthropic import AnthropicClient
from my_openai import OpenaiClient
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any
from asgiref.wsgi import WsgiToAsgi
from hypercorn.config import Config
from hypercorn.asyncio import serve


app = Flask(__name__)
CORS(app)

# Load environment variables
load_dotenv()

system_prompt = "You are a helpful assistant."

# Client mapping
CLIENT_MAP = {
    'llama': lambda: LlamaLocalClient(system_prompt),
    'anthropic': lambda: AnthropicClient(os.environ.get("ANTHROPIC_API_KEY"), system_prompt),
    'openai': lambda: OpenaiClient(os.environ.get("OPENAI_API_KEY"), system_prompt)
}

# Response key mapping
RESPONSE_KEY_MAP = {
    'llama': 'response1',
    'anthropic': 'response2',
    'openai': 'response3'
}

# Initialize API clients
clients = {
    'llama': LlamaLocalClient(system_prompt),
    'anthropic': AnthropicClient(os.environ.get("ANTHROPIC_API_KEY"), system_prompt),
    'openai': OpenaiClient(os.environ.get("OPENAI_API_KEY"), system_prompt)
}

executor = ThreadPoolExecutor(max_workers=3)

async def get_selected_responses(message: str, active_windows: List[str] = None) -> Dict[str, Any]:
    """
    Get responses from selected AI models based on active windows.
    
    Args:
        message: The user's message
        active_windows: List of window IDs to get responses from. If None, get all responses.
    
    Returns:
        Dictionary containing responses from selected models
    """
    loop = asyncio.get_event_loop()
    selected_clients = active_windows if active_windows else list(clients.keys())
    
    # Create tasks only for selected clients
    tasks = [
        loop.run_in_executor(executor, clients[client_id].update_messages, message)
        for client_id in selected_clients
        if client_id in clients
    ]
    
    # Wait for selected tasks to complete
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

def reset_client(client_id: str) -> bool:
    """
    Reset a specific client if needed.
    Returns True if successful, False otherwise.
    """
    try:
        if client_id in CLIENT_MAP:
            clients[client_id] = CLIENT_MAP[client_id]()
            return True
        return False
    except Exception as e:
        print(f"Error resetting client {client_id}: {str(e)}")
        return False

@app.route('/reset', methods=['POST'])
def reset_clients():
    """
    Endpoint to reset specific or all clients
    """
    try:
        data = request.get_json()
        client_ids = data.get('clients') if data and 'clients' in data else list(clients.keys())
        
        results = {
            client_id: reset_client(client_id)
            for client_id in client_ids
            if client_id in clients
        }
        
        return jsonify({
            'success': True,
            'results': results
        })
    except Exception as e:
        return jsonify({
            'error': f'Error resetting clients: {str(e)}'
        }), 500

if __name__ == '__main__':
    asgi_app = WsgiToAsgi(app)
    
    # Configure Hypercorn
    config = Config()
    config.bind = ["127.0.0.1:5000"]  # Replace with your desired host:port
    config.use_reloader = True
    
    # Run the server
    asyncio.run(serve(asgi_app, config))
