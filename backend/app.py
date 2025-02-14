import os
import asyncio
from flask import Flask, request, jsonify
from flask_cors import CORS
from my_llama import LlamaClient, LlamaLocalClient
from my_anthropic import AnthropicClient
from my_openai import OpenaiClient
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor

app = Flask(name)
CORS(app)  # Enable CORS for all routes

# Load environment variables
load_dotenv()

system_prompt = "You are a helpful assistant."

# Initialize API clients
llama_client = LlamaLocalClient(system_prompt)
# llama_client = LlamaClient(os.getenv('LLAMA_API_KEY'), system_prompt)
anthropic_client = AnthropicClient(os.environ.get("ANTHROPIC_API_KEY"), system_prompt)
openai_client = OpenaiClient(os.environ.get("OPENAI_API_KEY"), system_prompt)

executor = ThreadPoolExecutor(max_workers=3)

async def get_all_responses(message):
    # Create tasks for each API call using the thread pool
    loop = asyncio.get_event_loop()
    tasks = [
        loop.run_in_executor(executor, llama_client.update_messages, message),
        loop.run_in_executor(executor, anthropic_client.update_messages, message),
        loop.run_in_executor(executor, openai_client.update_messages, message)
    ]

    # Wait for all tasks to complete
    responses = await asyncio.gather(*tasks)
    print(responses)

    return {
        'response1': responses[0],
        'response2': responses[1],
        'response3': responses[2]
    }

@app.route('/chat', methods=['GET'])
async def chat():
    try:
        # Get message from query parameters
        message = request.args.get('message')
        # print(f"Received message: {message}")  # Debug print

        if not message:
            return jsonify({
                'error': 'Message parameter is required'
            }), 400

        responses = await get_all_responses(message)

        # print("Sending responses:", responses)
        return jsonify(responses)

    except Exception as e:
        print(f"Error in chat endpoint: {str(e)}")
        return jsonify({
            'error': 'Internal server error processing chat request'
        }), 500

if name == 'main':
    app.run(debug=True)