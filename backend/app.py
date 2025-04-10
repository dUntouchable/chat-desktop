import os
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, AsyncGenerator, Union, Callable
from my_llama import LlamaLocalClient
from my_anthropic import AnthropicClient
from my_openai import OpenaiClient
from dotenv import load_dotenv
import json
import logging
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app")

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Load environment variables
load_dotenv()

system_prompt = "You are a helpful assistant with access to advanced tools. Use them when appropriate to provide more accurate and helpful information."

# Pydantic models for request validation
class ChatRequestBody(BaseModel):
    message: str
    windows: Optional[List[str]] = None
    attachment: Optional[Dict[str, Any]] = None

# Initialize clients
clients = {
    'llama': LlamaLocalClient(system_prompt, "falcon3:10b-instruct-q4_K_M"),
    'anthropic': AnthropicClient(os.environ.get("ANTHROPIC_API_KEY"), system_prompt),
    'openai': OpenaiClient(os.environ.get("OPENAI_API_KEY"), system_prompt)
}

# Map client IDs to response names
response_map = {
    'llama': 'response1',
    'anthropic': 'response2',
    'openai': 'response3'
}

@app.post("/chat-stream")
async def chat_stream(req: ChatRequestBody):
    print("     req: ", req)
    """Handle streaming chat requests with SSE response"""
    if not req.message:
        raise HTTPException(status_code=400, detail="Message parameter is required")

    # Validate requested windows
    if req.windows:
        active_windows = [w for w in req.windows if w in clients]
        if not active_windows:
            raise HTTPException(status_code=400, detail="No valid window IDs provided")
    else:
        active_windows = list(clients.keys())
    
    logger.info(f"Processing message with clients: {active_windows}")
    
    async def generate():
        # Create tasks for all active clients
        tasks = [process_client_messages(client_id, req.message) for client_id in active_windows]
        
        # Process all tasks concurrently and yield results as they arrive
        async for result in merge_async_generators(tasks):
            yield result
    
    # Return a streaming response with SSE media type
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

async def process_client_messages(client_id: str, message: str):
    """Process messages from any client and yield formatted SSE messages."""
    try:
        logger.info(f"Processing message with {client_id} client")
        # Get the client response
        response = clients[client_id].update_messages(message)
        
        # Handle the response based on its type
        if hasattr(response, '__aiter__'):  # Async generator (like Anthropic)
            async for chunk in response:
                if chunk:
                    logger.debug(f"Yielding chunk from {client_id}")
                    yield format_sse_message(client_id, chunk)
                    
        elif hasattr(response, '__iter__') and not isinstance(response, str):  # Sync generator
            for chunk in response:
                if chunk:
                    logger.debug(f"Yielding chunk from {client_id}")
                    yield format_sse_message(client_id, chunk)
        else:  # Single response
            logger.debug(f"Yielding single response from {client_id}")
            yield format_sse_message(client_id, response)
            
    except Exception as e:
        logger.error(f"Error in {client_id} client: {str(e)}")
        yield format_sse_message(client_id, f"Error: {str(e)}")

async def merge_async_generators(generators):
    """Merge multiple async generators into one, yielding items as they become available."""
    # Create a task for the first item from each generator
    pending_tasks = {}
    for i, gen in enumerate(generators):
        task = asyncio.create_task(anext_with_index(i, gen))
        pending_tasks[task] = i
    
    # Keep processing until all generators are exhausted
    while pending_tasks:
        # Wait for any task to complete
        done, pending = await asyncio.wait(
            pending_tasks.keys(),
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Process completed tasks
        for task in done:
            gen_index = pending_tasks.pop(task)
            try:
                # Get the result and yield it
                item, gen = task.result()
                if item:
                    logger.debug(f"Yielding message from generator {gen_index}")
                    yield item
                
                # Schedule the next item from this generator
                next_task = asyncio.create_task(anext_with_index(gen_index, gen))
                pending_tasks[next_task] = gen_index
            except StopAsyncIteration:
                # This generator is exhausted
                logger.debug(f"Generator {gen_index} is exhausted")
                pass
            except Exception as e:
                logger.error(f"Error processing generator {gen_index}: {str(e)}")

async def anext_with_index(index, agen):
    """Get the next item from an async generator, along with the generator itself."""
    item = await anext(agen)
    return item, agen

def format_sse_message(client_id, chunk):
    """Format a message for SSE."""
    # Convert non-primitive types to string
    if not isinstance(chunk, (str, int, float, bool, type(None))):
        chunk_str = str(chunk)
    else:
        chunk_str = chunk
    
    # Create the response data
    response_data = {
        'model': response_map.get(client_id, 'unknown'),
        'chunk': chunk_str
    }
    
    # Format as SSE message
    return f"data: {json.dumps(response_data)}\n\n"

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        'status': 'healthy',
        'models': list(clients.keys())
    }

if __name__ == "__main__":
    # Start the FastAPI app with Uvicorn
    uvicorn.run(app, host="localhost", port=5000)