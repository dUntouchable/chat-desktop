from llamaapi import LlamaAPI
import requests

class LlamaLocalClient:
    def __init__(self, system_prompt: str, model = "deepseek-r1:1.5b"):
        """Initialize the client with the base URL."""
        self.url = "http://localhost:11434/api/chat"
        self.model = model
        self.messages = [
            {
                "role": "system",
                "content": system_prompt
            }
        ]
    
    def get_llama_response(self) -> str:
        """Send a request to the chat API endpoint."""
        headers = {'Content-Type': 'application/json'}
        
        data = {
            "model": self.model,
            "messages": self.messages,
            "stream": False
        }
        
        response = requests.post(self.url, headers=headers, json=data)
        
        if response.status_code == 200:
            response_content = response.json()["message"]["content"]
            self.messages.append({"role": "assistant", "content": response_content})
            return response_content
        else:
            response.raise_for_status()
    
    def update_messages(self, user_message):
        self.messages.append({"role": "user", "content": user_message})
        return self.get_llama_response()


class LlamaClient:
    def __init__(self, api_key, system_prompt, model = "llama3.1-8b"):
        self.api_key = api_key
        # self.llama = LlamaAPI(api_key)
        self.llama = LlamaAPI(
            api_token='',
            hostname='http://localhost:11434',
            domain_path='/api/generate'
        )
        self.model = model
        self.messages = [
            {
                "role": "system",
                "content": system_prompt
            }
        ]

    def get_llama_response(self):
        api_request_json = {
            "model": self.model,
            "messages": self.messages,
            "stream": False,
            "max_tokens": 4096,
            "temperature": 0.7,
            "top_p": 0.9,
            "frequency_penalty": 0.0,
            "presence_penalty": 0.0,
            "stop": None
        }
        try:
            response = self.llama.run(api_request_json)
            llama_response = response.json()

            if 'choices' in llama_response and len(llama_response['choices']) > 0:
                assistant_message = llama_response['choices'][0]['message']['content']
                self.messages.append({"role": "assistant", "content": assistant_message})
                return assistant_message
            else:
                raise Exception("Invalid response format from Llama API")

        except Exception as e:
            print(f"Llama API Error: {str(e)}")
            self.messages.append({"role": "assistant", "content": f"Error getting Llama response: {str(e)}"})
            return f"Error getting Llama response: {str(e)}"

    def update_messages(self, user_message):
        self.messages.append({"role": "user", "content": user_message})
        return self.get_llama_response()