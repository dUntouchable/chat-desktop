# from llamaapi import LlamaAPI
import requests
import json
from typing import Generator


class LlamaLocalClient:
    def __init__(self, system_prompt: str, model: str = "deepseek-r1:1.5b"):
        """Initialize the client with the base URL and system prompt."""
        self.url = "http://localhost:11434/api/generate"
        self.model = model
        self.system_prompt = system_prompt
        self.conversation_history = []
    
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
                            print(f"Error decoding JSON: {e}")
                            continue
                self.conversation_history.append({"role": "assistant", "content": full_response})
                
        except requests.RequestException as e:
            print(f"Error making request: {e}")
            raise

    def update_messages(self, user_message: str) -> str:
        self.conversation_history.append({"role": "user", "content": user_message})
        return self.get_llama_response(user_message)
