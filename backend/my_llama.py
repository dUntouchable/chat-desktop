# from llamaapi import LlamaAPI
import requests
import json
import logging
import os
import asyncio
from mcp_client import MCPClient
from typing import Generator, AsyncGenerator, Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("llama_client")

class LlamaLocalClient:
    def __init__(self, system_prompt: str, model: str = "deepseek-r1:1.5b"):
        """Initialize the client with the base URL and system prompt."""
        # self.url = "http://localhost:11434/api/generate"
        self.url = "http://192.168.1.8:11434/api/generate"
        self.model = model
        self.system_prompt = system_prompt
        self.conversation_history = []
        
        # Initialize MCPClient without API keys (Llama is local)
        self.mcp_client = MCPClient(api_keys={})
        # Initialize connection flag
        self.is_connected = False
    
    async def connect_mcp(self):
        """Connect to the MCP server if not already connected."""
        if not self.is_connected:
            try:
                await self.mcp_client.connect()
                self.is_connected = True
                logger.info("Successfully connected to MCP server")
            except Exception as e:
                logger.error(f"Error connecting to MCP server: {str(e)}")
                raise

    async def disconnect_mcp(self):
        """Disconnect from the MCP server if connected."""
        if self.is_connected:
            try:
                await self.mcp_client.disconnect()
                self.is_connected = False
                logger.info("Successfully disconnected from MCP server")
            except Exception as e:
                logger.error(f"Error disconnecting from MCP server: {str(e)}")
    
    def _build_prompt(self, user_message: str) -> str:
        """Build the complete prompt including conversation history."""
        # Start with the system prompt
        full_prompt = f"System: {self.system_prompt}\n\n"
        
        # Add conversation history
        for msg in self.conversation_history:
            role = msg["role"]
            content = msg["content"]
            full_prompt += f"{role.capitalize()}: {content}\n"
        
        # Add the new user message
        full_prompt += f"User: {user_message}\nAssistant:"
        return full_prompt
    
    def get_llama_response(self, user_message: str) -> Generator[str, None, None]:
        """Send a request to the generate API endpoint and stream the response."""
        headers = {'Content-Type': 'application/json'}
        
        # Build the complete prompt
        prompt = self._build_prompt(user_message)
        
        data = {
            "model": self.model,
            "prompt": prompt,
            "stream": True
        }
        
        try:
            with requests.post(self.url, headers=headers, json=data, stream=True) as response:
                response.raise_for_status()
                
                full_response = ""
                for line in response.iter_lines():
                    if line:
                        try:
                            json_response = json.loads(line.decode('utf-8'))
                            
                            # Extract the response content
                            content = json_response.get("response", "")
                            full_response += content
                            yield content
                            
                        except json.JSONDecodeError as e:
                            logger.error(f"Error decoding JSON: {e}")
                            continue
                self.conversation_history.append({"role": "assistant", "content": full_response})
                
        except requests.RequestException as e:
            logger.error(f"Error making request: {e}")
            raise
    
    async def get_mcp_response_stream(self, user_message: str) -> AsyncGenerator[str, None]:
        """
        Streams the response using MCPClient's process_query_stream with Llama.
        """
        try:
            # Make sure we're connected to the MCP server
            await self.connect_mcp()
            
            full_response = ""
            logger.info(f"Starting MCP response stream for Llama for message: {user_message[:50]}...")
            
            # Create a task for streaming that can be properly cancelled
            async for text in self.mcp_client.process_query_stream(
                self.system_prompt,
                user_message, 
                self.model,
                provider="llama",
                llama_url=f"{self.url}"
            ):
                try:
                    if text:
                        full_response += text
                        logger.debug(f"Yielding chunk to update_messages: {text[:50]}")
                        yield text
                except asyncio.CancelledError:
                    logger.info("Stream cancelled by client")
                    # Add the partial response to messages
                    if full_response:
                        self.conversation_history.append({"role": "assistant", "content": full_response})
                    raise  # Re-raise to propagate cancellation
            
            # Update the messages with the complete response
            logger.info(f"Completed MCP response stream for Llama. Full response length: {len(full_response)}")
            self.conversation_history.append({"role": "assistant", "content": full_response})
            
        except asyncio.CancelledError:
            # Handle cancellation cleanly
            logger.info("Response streaming was cancelled")
            raise
        except Exception as e:
            error_message = f"Error getting MCP response for Llama: {str(e)}"
            logger.error(error_message)
            self.conversation_history.append({"role": "assistant", "content": error_message})
            yield error_message
    
    async def update_messages_with_mcp(self, user_message: str) -> AsyncGenerator[str, None]:
        """
        Updates messages with user input and returns the MCP-powered response stream.
        This is the async version that supports tooling via MCP.
        """
        self.conversation_history.append({"role": "user", "content": user_message})
        logger.info(f"Processing user message with MCP: {user_message[:50]}...")
        
        try:
            async for chunk in self.get_mcp_response_stream(user_message):
                if chunk:
                    yield chunk
        except asyncio.CancelledError:
            logger.info("update_messages_with_mcp stream cancelled")
            raise
        except Exception as e:
            error_message = f"Error processing message with MCP: {str(e)}"
            logger.error(error_message)
            yield error_message

    def update_messages(self, user_message: str):
        """
        Legacy synchronous method - tries MCP first but falls back to regular Llama if needed.
        """
        self.conversation_history.append({"role": "user", "content": user_message})
        
        # Try to run in async mode with MCP if possible
        try:
            import asyncio
            
            # Check if we're in an event loop
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # We're in an event loop, so we can return the async generator directly
                    # The app's process_client_messages will handle it
                    return self.update_messages_with_mcp(user_message)
                else:
                    # No event loop running, but we can create one (fallback)
                    return asyncio.run(self._collect_async_responses(user_message))
            except RuntimeError:
                # No event loop, use synchronous version
                return self.get_llama_response(user_message)
        except ImportError:
            # Asyncio not available, use synchronous version
            return self.get_llama_response(user_message)
    
    async def _collect_async_responses(self, user_message: str) -> Generator[str, None, None]:
        """Helper method to collect async responses and convert to a regular generator."""
        collected_chunks = []
        async for chunk in self.update_messages_with_mcp(user_message):
            collected_chunks.append(chunk)
            yield chunk
    
    async def __aenter__(self):
        """Async context manager entry."""
        await self.connect_mcp()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.disconnect_mcp()
        # Don't suppress exceptions
        return False

if __name__ == "__main__":
    client = LlamaLocalClient("You are a helpful assistant.", "falcon3:10b-instruct-q4_K_M")
    response = client.update_messages("Hello, how are you?")
    for chunk in response:
        print(chunk)