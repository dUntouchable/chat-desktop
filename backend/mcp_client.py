#!/usr/bin/env python
"""
Modular MCP client implementation with streaming support.
Supports multiple LLM backends: Anthropic, OpenAI, and local LLMs.
"""

import os
import asyncio
import json
from dotenv import load_dotenv
from anthropic import Anthropic
from openai import OpenAI
from typing import Optional, Dict, List, Any, AsyncGenerator, Callable, Literal
import logging

# Import MCPBraveServer from the new module
from mcp_brave_server import MCPBraveServer

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mcp_client")


class MCPClient:
    """A modular client for MCP servers with streaming support."""
    
    def __init__(self, api_keys: Dict[str, str] = None):
        """Initialize the MCP client.
        
        Args:
            api_keys: Dictionary of API keys (e.g., {'anthropic': 'key', 'openai': 'key'})
        """
        # Load environment variables if not provided
        load_dotenv()
        
        self.api_keys = api_keys or {}
        # Load from environment if not provided
        if 'anthropic' not in self.api_keys:
            self.api_keys['anthropic'] = os.getenv("ANTHROPIC_API_KEY", "")
        if 'openai' not in self.api_keys:
            self.api_keys['openai'] = os.getenv("OPENAI_API_KEY", "")
            
        # Initialize clients based on available keys
        self.clients = {}
        if self.api_keys.get('anthropic'):
            self.clients['anthropic'] = Anthropic(api_key=self.api_keys.get('anthropic'))
        if self.api_keys.get('openai'):
            self.clients['openai'] = OpenAI(api_key=self.api_keys.get('openai'))
        
        # Initialize MCP Brave Server
        self.mcp_brave_server = MCPBraveServer()
        
        # Tools configuration for different models
        self.tools = {
            'anthropic': [],  # Anthropic format tools
            'openai': []      # OpenAI format tools
        }
        
    def _validate_api_keys(self, provider: str = None):
        """Validate that required API keys are present.
        
        Args:
            provider: Optional provider to validate ('anthropic', 'openai', or None for all)
        """
        missing_keys = []
        
        if provider == 'anthropic' or provider is None:
            if not self.api_keys.get('anthropic') and 'anthropic' in self.clients:
                missing_keys.append('anthropic')
                
        if provider == 'openai' or provider is None:
            if not self.api_keys.get('openai') and 'openai' in self.clients:
                missing_keys.append('openai')
        
        if missing_keys:
            raise ValueError(f"Missing required API keys: {', '.join(missing_keys)}")
    
    async def connect(self):
        """Connect to the Brave MCP server."""
        # Connect to the MCP Brave Server
        tools = await self.mcp_brave_server.connect()
        
        # Log the tools schema received from the server
        logger.debug(f"Received tools schema from MCP server: {tools}")
        
        # Convert to Anthropic tool format
        self.tools['anthropic'] = [{
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.inputSchema
        } for tool in tools]
        
        # Convert to OpenAI tool format
        self.tools['openai'] = [{
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": self._prepare_openai_parameters(tool.inputSchema)
            }
        } for tool in tools]
        
        return tools
    
    def _prepare_openai_parameters(self, input_schema):
        """Prepare the input schema for OpenAI by ensuring it has the required properties."""
        # Create a deep copy of the schema to avoid modifying the original
        schema = json.loads(json.dumps(input_schema))
        
        # Set additionalProperties: false if not present
        schema["additionalProperties"] = False
        
        # Make sure 'type' is set to 'object'
        schema["type"] = "object"
        
        # Ensure 'properties' exists
        if "properties" not in schema:
            schema["properties"] = {}
        
        # For each property, make sure it has a type
        if "properties" in schema and isinstance(schema["properties"], dict):
            for prop_name, prop_value in schema["properties"].items():
                if isinstance(prop_value, dict) and "type" not in prop_value:
                    # Default to string if type is missing
                    schema["properties"][prop_name]["type"] = "string"
        
        # For query parameter specifically, enhance if it exists
        if "properties" in schema and "query" in schema["properties"]:
            query_prop = schema["properties"]["query"]
            if isinstance(query_prop, dict):
                if "type" not in query_prop:
                    query_prop["type"] = "string"
                if "description" not in query_prop:
                    query_prop["description"] = "The search query to execute"
        
        # If there are no required fields specified, make all properties required
        if "required" not in schema and "properties" in schema:
            schema["required"] = list(schema["properties"].keys())
        
        # Log the prepared schema
        logger.debug(f"Prepared OpenAI schema: {json.dumps(schema)}")
            
        return schema
    
    async def disconnect(self):
        """Disconnect from the MCP server."""
        await self.mcp_brave_server.disconnect()
    
    async def __aenter__(self):
        """Async context manager entry."""
        await self.connect()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.disconnect()
    
    async def process_anthropic_stream(
        self,
        system_prompt: str,
        query: str, 
        model: str = "claude-3-7-sonnet-latest",
        callback: Optional[Callable[[str], None]] = None
    ) -> AsyncGenerator[str, None]:
        """Process a query with Anthropic and stream the response.
        
        Args:
            system_prompt: The system prompt for Claude
            query: The user query
            model: The Claude model to use
            callback: Optional callback function to receive chunks
            
        Yields:
            Response text chunks as they become available
        """
        if not self.mcp_brave_server.session:
            raise RuntimeError("Not connected to MCP server. Call connect() first.")
        
        # Validate API key
        self._validate_api_keys('anthropic')
        
        logger.info(f"Processing streaming query with Anthropic: '{query}' with model {model}")
        
        # Initial message to Claude
        messages = [{"role": "user", "content": query}]
        
        # Get streaming response
        with self.clients['anthropic'].messages.stream(
            model=model,
            max_tokens=1000,
            system=system_prompt,
            messages=messages,
            tools=self.tools['anthropic']
        ) as stream:
            current_tool_calls = []
            
            # Process the stream - using regular for loop since stream is not an async iterator
            for chunk in stream:
                # Handle content delta if present
                if chunk.type == "content_block_delta" and chunk.delta.type == "text_delta":
                    if callback:
                        callback(chunk.delta.text)
                    yield chunk.delta.text
                
                # Handle tool calls after message completion
                elif chunk.type == "message_stop":
                    # Log message stop event
                    logger.debug(f"Received message_stop event in main stream: {chunk.message.stop_reason if chunk.message else 'No message'}")
                    
                    # Extract tool use blocks from the message content if available
                    if chunk.message and chunk.message.stop_reason == "tool_use":
                        # Find all tool_use blocks in the message content
                        tool_use_blocks = [
                            content_block for content_block in chunk.message.content 
                            if hasattr(content_block, 'type') and content_block.type == "tool_use"
                        ]
                        
                        current_tool_calls = tool_use_blocks
                    
                    # If there were tool calls, process them
                    if current_tool_calls:
                        # Add tool calls to messages
                        tool_calls_content = [
                            {
                                "type": "tool_use",
                                "name": tool.name,
                                "input": tool.input,
                                "id": tool.id
                            } 
                            for tool in current_tool_calls
                        ]
                        
                        messages.append({
                            "role": "assistant", 
                            "content": tool_calls_content
                        })
                        
                        # Process each tool call
                        for tool_block in current_tool_calls:
                            # Get tool input as dictionary
                            tool_input = tool_block.input
                            if isinstance(tool_input, str):
                                try:
                                    tool_input = json.loads(tool_input)
                                except json.JSONDecodeError:
                                    tool_input = {"query": tool_input}
                            
                            # Execute the tool
                            tool_message = f"\n[Using tool: {tool_block.name}]\n"
                            if callback:
                                callback(tool_message)
                            yield tool_message
                            
                            # Call the tool through the MCP Brave Server
                            tool_result = await self.mcp_brave_server.call_tool(
                                tool_block.name,
                                tool_input
                            )
                            
                            # Yield the tool result information to the caller
                            result_summary = f"\n[Tool results from {tool_block.name}]\n"
                            if callback:
                                callback(result_summary)
                            yield result_summary
                            
                            # Extract content from tool result
                            tool_result_content = None
                            if hasattr(tool_result, 'content'):
                                tool_result_content = tool_result.content
                            elif hasattr(tool_result, 'result'):
                                tool_result_content = tool_result.result
                            else:
                                tool_result_content = str(tool_result)
   
                            # Ensure tool_result_content is JSON serializable
                            if hasattr(tool_result_content, '__dict__'):
                                # For objects with __dict__, convert to dict
                                tool_result_content = tool_result_content.__dict__
                            
                            # If tool_result_content is still not serializable, convert to string
                            try:
                                json.dumps(tool_result_content)
                            except (TypeError, ValueError):
                                logger.warning(f"Tool result not JSON serializable, converting to string: {type(tool_result_content)}")
                                tool_result_content = str(tool_result_content)
                            
                            # Add tool result to messages
                            messages.append({
                                "role": "user",
                                "content": [
                                    {
                                        "type": "tool_result",
                                        "tool_use_id": tool_block.id,
                                        "content": tool_result_content
                                    }
                                ]
                            })
                        
                        # Get Claude's response with tool results (streaming)
                        current_tool_calls = []  # Reset for potential new tool calls
                        
                        # Start a new stream with the updated messages
                        after_tool_system_prompt = "You are a helpful assistant analyse the messages and tool results and provide a an appropriate response to the user."
                        with self.clients['anthropic'].messages.stream(
                            model=model,
                            max_tokens=1000,
                            system=after_tool_system_prompt,
                            messages=messages,
                            tools=self.tools['anthropic']
                        ) as follow_up_stream:
                            # Process the follow-up stream - using regular for loop
                            
                            for follow_chunk in follow_up_stream:
                                # Handle content delta
                                if follow_chunk.type == "content_block_delta" and follow_chunk.delta.type == "text_delta":
                                    if callback:
                                        callback(follow_chunk.delta.text)
                                    yield follow_chunk.delta.text
    
    async def process_openai_stream(
        self,
        system_prompt: str,
        query: str, 
        model: str = "gpt-4o",
        callback: Optional[Callable[[str], None]] = None
    ) -> AsyncGenerator[str, None]:
        """Process a query with OpenAI and stream the response.
        
        Args:
            system_prompt: The system prompt
            query: The user query
            model: The OpenAI model to use
            callback: Optional callback function to receive chunks
            
        Yields:
            Response text chunks as they become available
        """
        if not self.mcp_brave_server.session:
            raise RuntimeError("Not connected to MCP server. Call connect() first.")
        
        # Validate API key
        self._validate_api_keys('openai')
        
        logger.info(f"Processing streaming query with OpenAI: '{query}' with model {model}")
        
        # Initial message setup
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ]
        
        # Check if we have valid tools
        have_valid_tools = bool(self.tools['openai'])
        
        if have_valid_tools:
            # Log the tools being used
            logger.debug(f"Using OpenAI tools: {json.dumps(self.tools['openai'])}")
        else:
            logger.warning("No valid tools available for OpenAI, proceeding without tools")
        
        try:
            # Prepare request parameters
            openai_params = {
                "model": model,
                "messages": messages,
                "stream": True
            }
            
            # Add tools if available
            if have_valid_tools:
                openai_params["tools"] = self.tools['openai']
                openai_params["tool_choice"] = "auto"  # Explicitly set tool choice
            
            # Get streaming response
            stream = self.clients['openai'].chat.completions.create(**openai_params)
            
            full_response = ""
            collected_chunks = []
            tool_calls_data = []
            
            # Process the stream
            for chunk in stream:
                # Handle content if present
                if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                    text = chunk.choices[0].delta.content
                    full_response += text
                    collected_chunks.append(text)
                    if callback:
                        callback(text)
                    yield text
                
                # Handle tool calls
                if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.tool_calls:
                    for tool_call_delta in chunk.choices[0].delta.tool_calls:
                        # Track and build tool calls - OpenAI streams these in pieces
                        if len(tool_calls_data) <= tool_call_delta.index:
                            tool_calls_data.append({
                                "id": tool_call_delta.id or "",
                                "type": tool_call_delta.type or "",
                                "function": {
                                    "name": tool_call_delta.function.name or "",
                                    "arguments": tool_call_delta.function.arguments or ""
                                }
                            })
                        else:
                            if tool_call_delta.id:
                                tool_calls_data[tool_call_delta.index]["id"] = tool_call_delta.id
                            if tool_call_delta.type:
                                tool_calls_data[tool_call_delta.index]["type"] = tool_call_delta.type
                            if tool_call_delta.function.name:
                                tool_calls_data[tool_call_delta.index]["function"]["name"] = tool_call_delta.function.name
                            if tool_call_delta.function.arguments:
                                tool_calls_data[tool_call_delta.index]["function"]["arguments"] += tool_call_delta.function.arguments
            
            # Process tool calls if any were collected
            if tool_calls_data:
                # Add assistant's message with tool calls
                messages.append({
                    "role": "assistant",
                    "content": full_response,
                    "tool_calls": tool_calls_data
                })
                
                # Process each tool call
                for tool_call in tool_calls_data:
                    # Extract function name and arguments
                    function_name = tool_call["function"]["name"]
                    
                    # Parse arguments
                    try:
                        function_args = json.loads(tool_call["function"]["arguments"])
                    except json.JSONDecodeError:
                        function_args = {"query": tool_call["function"]["arguments"]}
                    
                    # Execute the tool
                    tool_message = f"\n[Using tool: {function_name}]\n"
                    if callback:
                        callback(tool_message)
                    yield tool_message
                    
                    # Call the tool
                    tool_result = await self.mcp_brave_server.call_tool(
                        function_name,
                        function_args
                    )
                    
                    # Yield the tool result summary
                    result_summary = f"\n[Tool results from {function_name}]\n"
                    if callback:
                        callback(result_summary)
                    yield result_summary
                    
                    # Extract and process content from tool result
                    tool_result_content = None
                    if hasattr(tool_result, 'content'):
                        tool_result_content = tool_result.content
                    elif hasattr(tool_result, 'result'):
                        tool_result_content = tool_result.result
                    else:
                        tool_result_content = str(tool_result)
                    
                    # Ensure tool_result_content is JSON serializable
                    if hasattr(tool_result_content, '__dict__'):
                        # For objects with __dict__, convert to dict
                        tool_result_content = tool_result_content.__dict__
                    
                    # If tool_result_content is still not serializable, convert to string
                    try:
                        json.dumps(tool_result_content)
                    except (TypeError, ValueError):
                        logger.warning(f"Tool result not JSON serializable, converting to string: {type(tool_result_content)}")
                        tool_result_content = str(tool_result_content)
                    
                    # Add tool result to messages
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "content": json.dumps(tool_result_content) if not isinstance(tool_result_content, str) else tool_result_content
                    })
                
                # Get a follow-up response with the tool results
                after_tool_system_prompt = "You are a helpful assistant. Analyze the messages and tool results and provide an appropriate response to the user."
                follow_up_stream = self.clients['openai'].chat.completions.create(
                    model=model,
                    messages=messages,
                    stream=True
                )
                
                # Process the follow-up stream
                for follow_chunk in follow_up_stream:
                    if follow_chunk.choices and follow_chunk.choices[0].delta and follow_chunk.choices[0].delta.content:
                        text = follow_chunk.choices[0].delta.content
                        if callback:
                            callback(text)
                        yield text
        except Exception as e:
            error_message = f"Error in OpenAI streaming: {str(e)}"
            logger.error(error_message)
            # For OpenAI API errors, try to extract more detailed error information
            if hasattr(e, 'response') and hasattr(e.response, 'json'):
                try:
                    error_details = e.response.json()
                    logger.error(f"OpenAI API error details: {json.dumps(error_details)}")
                except Exception:
                    pass
            
            # Try a fallback without tools if the error was related to tools
            if have_valid_tools and "tools" in str(e).lower():
                logger.info("Attempting fallback to OpenAI without tools")
                try:
                    # Create a new stream without tools
                    fallback_stream = self.clients['openai'].chat.completions.create(
                        model=model,
                        messages=messages,
                        stream=True
                    )
                    
                    # Process the fallback stream
                    for fallback_chunk in fallback_stream:
                        if (fallback_chunk.choices and fallback_chunk.choices[0].delta 
                            and fallback_chunk.choices[0].delta.content):
                            text = fallback_chunk.choices[0].delta.content
                            if callback:
                                callback(text)
                            yield text
                    
                    # Return early since we've successfully fallen back
                    return
                except Exception as fallback_e:
                    logger.error(f"Fallback to OpenAI without tools also failed: {str(fallback_e)}")
            
            # If we get here, yield the error message
            yield f"Error: {error_message}"
    
    async def process_llama_stream(
        self,
        system_prompt: str,
        query: str,
        llama_url: str,
        model: str = "deepseek-r1:1.5b",
        callback: Optional[Callable[[str], None]] = None
    ) -> AsyncGenerator[str, None]:
        """Process a query with a local Llama model and stream the response.
        
        For Llama, we use prompt engineering to enable tool use since it doesn't natively
        support tool calling API.
        
        Args:
            system_prompt: The system prompt
            query: The user query
            llama_url: URL for the local Llama API
            model: The model name
            callback: Optional callback function to receive chunks
            
        Yields:
            Response text chunks as they become available
        """
        if not self.mcp_brave_server.session:
            raise RuntimeError("Not connected to MCP server. Call connect() first.")
        
        logger.info(f"Processing streaming query with Llama: '{query}' with model {model}")
        
        # Get the list of available tools in a format Llama can understand
        tools_info = "\n".join([
            f"- {tool.name}: {tool.description}" for tool in await self.mcp_brave_server.connect()
        ])
        
        # Build an enhanced system prompt that tells Llama about the available tools
        enhanced_system_prompt = f"""
        {system_prompt}
        
        You have access to the following tools:
        {tools_info}
        
        When you need to use a tool, write your response in this format:
        
        I need to use <TOOL_NAME> with these parameters: <PARAMETERS_AS_JSON>
        
        For example: "I need to use brave_web_search with these parameters: {{\"query\": \"latest AI news\"}}"
        
        Wait for the tool results before continuing your response.
        """
        
        # Prepare the conversation history
        conversation = [
            {"role": "system", "content": enhanced_system_prompt},
            {"role": "user", "content": query}
        ]
        
        # Build the complete prompt
        full_prompt = f"System: {enhanced_system_prompt}\n\n"
        full_prompt += f"User: {query}\nAssistant:"
        
        # Set up the API request
        headers = {'Content-Type': 'application/json'}
        data = {
            "model": model,
            "prompt": full_prompt,
            "stream": True
        }
        
        # Make the initial request
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.post(llama_url, headers=headers, json=data) as response:
                response.raise_for_status()
                
                # Process the streaming response
                full_response = ""
                buffer = ""
                
                # Read the response line by line
                async for line in response.content:
                    if line:
                        try:
                            line_text = line.decode('utf-8')
                            json_response = json.loads(line_text)
                            
                            # Extract the content
                            content = json_response.get("response", "")
                            buffer += content
                            full_response += content
                            
                            # Check if we need to call a tool
                            if "I need to use " in buffer and " with these parameters: " in buffer:
                                # Try to extract the tool call
                                try:
                                    tool_parts = buffer.split("I need to use ")[1]
                                    tool_name = tool_parts.split(" with these parameters: ")[0].strip()
                                    params_text = tool_parts.split(" with these parameters: ")[1].strip()
                                    
                                    # Try to parse parameters as JSON
                                    try:
                                        # Find the JSON object by looking for {} structure
                                        import re
                                        json_match = re.search(r'\{.*\}', params_text)
                                        if json_match:
                                            params_json = json.loads(json_match.group(0))
                                            
                                            # We found a valid tool call, stop the current generation
                                            logger.info(f"Detected tool call to {tool_name} with params {params_json}")
                                            
                                            # Execute the tool
                                            tool_message = f"\n[Using tool: {tool_name}]\n"
                                            if callback:
                                                callback(tool_message)
                                            yield tool_message
                                            
                                            # Call the tool
                                            tool_result = await self.mcp_brave_server.call_tool(
                                                tool_name,
                                                params_json
                                            )
                                            
                                            # Extract and add tool result
                                            tool_result_content = None
                                            if hasattr(tool_result, 'content'):
                                                tool_result_content = tool_result.content
                                            elif hasattr(tool_result, 'result'):
                                                tool_result_content = tool_result.result
                                            else:
                                                tool_result_content = str(tool_result)
                                            
                                            # Ensure tool_result_content is JSON serializable
                                            if hasattr(tool_result_content, '__dict__'):
                                                # For objects with __dict__, convert to dict
                                                tool_result_content = tool_result_content.__dict__
                                            
                                            # If tool_result_content is still not serializable, convert to string
                                            try:
                                                json.dumps(tool_result_content)
                                            except (TypeError, ValueError):
                                                logger.warning(f"Tool result not JSON serializable, converting to string: {type(tool_result_content)}")
                                                tool_result_content = str(tool_result_content)
                                            
                                            # Yield the tool result
                                            result_summary = f"\n[Tool results from {tool_name}]\n"
                                            if callback:
                                                callback(result_summary)
                                            yield result_summary
                                            
                                            # Add the tool result to the conversation
                                            conversation.append({"role": "assistant", "content": buffer})
                                            conversation.append({"role": "tool", "name": tool_name, "content": json.dumps(tool_result_content) if not isinstance(tool_result_content, str) else tool_result_content})
                                            
                                            # Generate a new prompt with the tool results
                                            follow_up_prompt = f"{full_prompt}{buffer}\n\n[Tool Results from {tool_name}]: {json.dumps(tool_result_content)}\n\nAssistant:"
                                            
                                            # Make a follow-up request with the tool results
                                            follow_up_data = {
                                                "model": model,
                                                "prompt": follow_up_prompt,
                                                "stream": True
                                            }
                                            
                                            async with session.post(llama_url, headers=headers, json=follow_up_data) as follow_up_response:
                                                follow_up_response.raise_for_status()
                                                
                                                async for follow_up_line in follow_up_response.content:
                                                    if follow_up_line:
                                                        follow_up_text = follow_up_line.decode('utf-8')
                                                        try:
                                                            follow_up_json = json.loads(follow_up_text)
                                                            follow_up_content = follow_up_json.get("response", "")
                                                            if follow_up_content:
                                                                if callback:
                                                                    callback(follow_up_content)
                                                                yield follow_up_content
                                                        except json.JSONDecodeError:
                                                            continue
                                            
                                            # Stop processing the original response
                                            break
                                    except json.JSONDecodeError:
                                        # Not valid JSON yet, continue collecting
                                        pass
                                except Exception as e:
                                    logger.error(f"Error processing tool call: {str(e)}")
                            
                            # If we collected enough text without finding a tool call, yield it
                            if len(buffer) > 50:
                                chunk_to_yield = buffer[:25]
                                buffer = buffer[25:]
                                if callback:
                                    callback(chunk_to_yield)
                                yield chunk_to_yield
                            
                        except json.JSONDecodeError:
                            continue
                
                # Yield any remaining buffer
                if buffer:
                    if callback:
                        callback(buffer)
                    yield buffer
    
    async def process_query_stream(
        self,
        system_prompt: str,
        query: str, 
        model: str = "claude-3-7-sonnet-latest",
        provider: Literal["anthropic", "openai", "llama"] = "anthropic",
        llama_url: Optional[str] = None,
        callback: Optional[Callable[[str], None]] = None
    ) -> AsyncGenerator[str, None]:
        """Process a query with the specified provider and stream the response.
        
        Args:
            system_prompt: The system prompt
            query: The user query
            model: The model to use
            provider: The provider to use ('anthropic', 'openai', or 'llama')
            llama_url: URL for Llama API (required if provider is 'llama')
            callback: Optional callback function to receive chunks
            
        Yields:
            Response text chunks as they become available
        """
        if provider == "anthropic":
            async for chunk in self.process_anthropic_stream(system_prompt, query, model, callback):
                yield chunk
        elif provider == "openai":
            async for chunk in self.process_openai_stream(system_prompt, query, model, callback):
                yield chunk
        elif provider == "llama":
            if not llama_url:
                raise ValueError("llama_url is required when provider is 'llama'")
            async for chunk in self.process_llama_stream(system_prompt, query, llama_url, model, callback):
                yield chunk
        else:
            raise ValueError(f"Unsupported provider: {provider}")

    async def execute_search(self, query: str) -> Dict[str, Any]:
        """Execute a search directly without LLM involvement.
        
        Args:
            query: The search query string
        
        Returns:
            The search results
        """
        return await self.mcp_brave_server.execute_search(query)
    
# Example usage
async def main():
    """Example usage of the MCPClient."""
    client = MCPClient()
    
    try:
        # Connect to MCP server
        tools = await client.connect()
        print(f"Connected to MCP server with tools: {[tool.name for tool in client.mcp_brave_server.tools]}")

        # Process a query with streaming
        print("\nStreaming response:")
        system_prompt = """
        You are a helpful assistant that can use the brave_web_search tool to find information on the internet.
        If the user explicitly asks to search the internet, or asks about current events, or asks for news, then use Brave to search the web.
        """
        
        query = "News on waqf bill in india"
        print(f"\nQuery: {query}")
        
        # Get the response generator
        response_generator = client.process_query_stream(system_prompt, query)
        
        # Consume the async generator
        async for chunk in response_generator:
            print(chunk, end="", flush=True)
        
        print("\nQuery processing complete")
        
    finally:
        # Disconnect when done
        await client.disconnect()
        print("Client disconnected")


if __name__ == "__main__":
    asyncio.run(main()) 