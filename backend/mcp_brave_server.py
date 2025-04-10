#!/usr/bin/env python
"""
MCP Brave Server implementation.
"""

import os
import logging
from dotenv import load_dotenv
from mcp import StdioServerParameters, ClientSession
from mcp.client.stdio import stdio_client
from contextlib import AsyncExitStack
from typing import Dict, List, Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mcp_brave_server")


class MCPBraveServer:
    """A class to manage connection to the Brave MCP server."""
    
    def __init__(self):
        """Initialize the MCP Brave server.
        
        Args:
            brave_api_key: API key for Brave Search
        """
        # Load environment variables if not provided
        load_dotenv()
        
        # Load from environment if not provided
        self.brave_api_key = os.getenv("BRAVE_API_KEY", "")
            
        # Validate required keys
        self._validate_api_key()
        
        # Session state
        self.session = None
        self.tools = []
        self.exit_stack = None
        
    def _validate_api_key(self):
        """Validate that required API key is present."""
        if not self.brave_api_key:
            raise ValueError("Missing required Brave API key")
    
    async def connect(self):
        """Connect to the Brave MCP server."""
        logger.info("Connecting to Brave MCP server...")
        
        # Create the exit stack for resource management
        self.exit_stack = AsyncExitStack()
        
        # Set up MCP server parameters
        server_params = StdioServerParameters(
            command="npx",
            args=["-y", "@modelcontextprotocol/server-brave-search", "stdio"],
            env={"BRAVE_API_KEY": self.brave_api_key}
        )
        
        # Start the MCP server
        stdio_transport = await self.exit_stack.enter_async_context(stdio_client(server_params))
        stdio, write = stdio_transport
        
        # Create and initialize the session
        self.session = await self.exit_stack.enter_async_context(ClientSession(stdio, write))
        await self.session.initialize()
        
        # Get available tools
        tools_response = await self.session.list_tools()
        self.tools = tools_response.tools
        
        logger.info(f"Connected to MCP server with tools: {[tool.name for tool in self.tools]}")
        return self.tools
    
    async def disconnect(self):
        """Disconnect from the MCP server."""
        if self.exit_stack:
            await self.exit_stack.aclose()
            self.exit_stack = None
            self.session = None
            logger.info("Disconnected from MCP server")
    
    async def call_tool(self, tool_name: str, tool_input: Dict[str, Any]):
        """Call a tool on the MCP server.
        
        Args:
            tool_name: Name of the tool to call
            tool_input: Input parameters for the tool
            
        Returns:
            Tool result
        """
        if not self.session:
            raise RuntimeError("Not connected to MCP server. Call connect() first.")
        
        return await self.session.call_tool(tool_name, tool_input)
    
    async def execute_search(self, query: str) -> Dict[str, Any]:
        """Execute a search directly without LLM involvement.
        
        Args:
            query: The search query string
        
        Returns:
            The search results
        """
        if not self.session:
            raise RuntimeError("Not connected to MCP server. Call connect() first.")
        
        logger.info(f"Executing direct search for: '{query}'")
        result = await self.session.call_tool("brave_web_search", {"query": query})
        
        # Extract and return content based on result structure
        if hasattr(result, 'content'):
            return result.content
        elif hasattr(result, 'result'):
            return result.result
        else:
            return {"raw_result": str(result)}

