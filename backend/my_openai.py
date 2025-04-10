from openai import OpenAI
import logging
import os
import asyncio
from mcp_client import MCPClient
from typing import AsyncGenerator, Generator, Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("openai_client")

class OpenaiClient:
    def __init__(self, api_key: str, system_prompt: str, model: str = "gpt-4o-mini"):
        self.api_key = api_key
        self.openai = OpenAI(api_key=self.api_key)
        self.model = model
        self.messages = [
            {
                "role": "system",
                "content": system_prompt
            }
        ]
        # Initialize MCPClient with the OpenAI API key
        self.mcp_client = MCPClient(api_keys={'openai': self.api_key})
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

    def get_openai_response(self):
        """Get a response from OpenAI without tools (synchronous version)."""
        try:
            completion = self.openai.chat.completions.create(
                model=self.model,
                messages=self.messages,
                stream=True
            )
            collected_chunks = []
            for chunk in completion:
                if chunk.choices[0].delta.content is not None:
                    collected_chunks.append(chunk.choices[0].delta.content)
                    yield chunk.choices[0].delta.content

            full_response = "".join(collected_chunks)
            self.messages.append({"role": "assistant", "content": full_response})

        except Exception as e:
            error_message = f"Error getting OpenAI response: {str(e)}"
            self.messages.append({"role": "assistant", "content": error_message})
            yield error_message
    
    async def get_mcp_response_stream(self, user_message: str) -> AsyncGenerator[str, None]:
        """
        Streams the response using MCPClient's process_query_stream with OpenAI.
        """
        try:
            # Make sure we're connected to the MCP server
            await self.connect_mcp()
            
            full_response = ""
            logger.info(f"Starting MCP response stream for OpenAI for message: {user_message[:50]}...")
            
            # Create a task for streaming that can be properly cancelled
            async for text in self.mcp_client.process_query_stream(
                self.messages[0]["content"],  # System prompt
                user_message, 
                self.model,
                provider="openai"
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
                        self.messages.append({"role": "assistant", "content": full_response})
                    raise  # Re-raise to propagate cancellation
            
            # Update the messages with the complete response
            logger.info(f"Completed MCP response stream for OpenAI. Full response length: {len(full_response)}")
            self.messages.append({"role": "assistant", "content": full_response})
            
        except asyncio.CancelledError:
            # Handle cancellation cleanly
            logger.info("Response streaming was cancelled")
            raise
        except Exception as e:
            error_message = f"Error getting MCP response for OpenAI: {str(e)}"
            logger.error(error_message)
            self.messages.append({"role": "assistant", "content": error_message})
            yield error_message
        
    async def update_messages_with_mcp(self, user_message: str) -> AsyncGenerator[str, None]:
        """
        Updates messages with user input and returns the MCP-powered response stream.
        This is the async version that supports tooling via MCP.
        """
        self.messages.append({"role": "user", "content": user_message})
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
        Legacy synchronous method - tries MCP first but falls back to regular OpenAI if needed.
        """
        self.messages.append({"role": "user", "content": user_message})
        
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
                return self.get_openai_response()
        except ImportError:
            # Asyncio not available, use synchronous version
            return self.get_openai_response()
    
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