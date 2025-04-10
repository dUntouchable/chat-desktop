from anthropic import Anthropic
from typing import Generator, AsyncGenerator
import os
import asyncio
from mcp_client import MCPClient
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("anthropic_client")

class AnthropicClient:
    def __init__(self, api_key: str, system_prompt: str, model: str = "claude-3-7-sonnet-latest"):
        self.api_key = api_key
        self.anthropic = Anthropic(api_key=self.api_key)
        self.model = model
        self.messages = []
        self.system_prompt = system_prompt
        # Initialize MCPClient with the Anthropic API key
        self.mcp_client = MCPClient(api_keys={'anthropic': self.api_key})
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

    async def get_mcp_response_stream(self, user_message: str) -> AsyncGenerator[str, None]:
        """
        Streams the response using MCPClient's process_query_stream.
        """
        try:
            # Make sure we're connected to the MCP server
            await self.connect_mcp()
            
            full_response = ""
            logger.info(f"Starting MCP response stream for message: {user_message[:50]}...")
            
            # Create a task for streaming that can be properly cancelled
            async for text in self.mcp_client.process_query_stream(
                self.system_prompt, 
                user_message, 
                self.model
            ):
                try:
                    logger.debug(f"Received chunk from MCP: {text[:50] if text else 'EMPTY'}")
                    full_response += text
                    if text:
                        logger.debug(f"Yielding chunk to update_messages: {text[:50]}")
                        yield text
                except asyncio.CancelledError:
                    logger.info("Stream cancelled by client")
                    # Add the partial response to messages
                    if full_response:
                        self.messages.append({"role": "assistant", "content": full_response})
                    raise  # Re-raise to propagate cancellation
            
            # Update the messages with the complete response
            logger.info(f"Completed MCP response stream. Full response length: {len(full_response)}")
            self.messages.append({"role": "assistant", "content": full_response})
            
        except asyncio.CancelledError:
            # Handle cancellation cleanly
            logger.info("Response streaming was cancelled")
            raise
        except Exception as e:
            error_message = f"Error getting MCP response: {str(e)}"
            logger.error(error_message)
            self.messages.append({"role": "assistant", "content": error_message})
            yield error_message

    async def update_messages(self, user_message: str) -> AsyncGenerator[str, None]:
        """
        Updates messages with user input and returns the MCP-powered response stream.
        """
        self.messages.append({"role": "user", "content": user_message})
        logger.info(f"Processing user message: {user_message[:50]}...")
        
        try:
            async for chunk in self.get_mcp_response_stream(user_message):
                if chunk:
                    logger.debug(f"update_messages yielding chunk: {chunk[:50] if chunk else 'EMPTY'}")
                    yield chunk
        except asyncio.CancelledError:
            logger.info("update_messages stream cancelled")
            raise
        except Exception as e:
            error_message = f"Error processing message: {str(e)}"
            logger.error(error_message)
            yield error_message

    async def __aenter__(self):
        """Async context manager entry."""
        await self.connect_mcp()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.disconnect_mcp()
        # Don't suppress exceptions
        return False
