from anthropic import Anthropic
from typing import Generator

class AnthropicClient:
    def __init__(self, api_key: str, system_prompt: str, model: str = "claude-3-7-sonnet-latest"):
        self.api_key = api_key
        self.anthropic = Anthropic(api_key=self.api_key)
        self.model = model
        self.messages = []
        self.system_prompt = system_prompt

    def get_anthropic_response_stream(self) -> Generator[str, None, None]:
        """
        Streams the response from Anthropic's API token by token.
        """
        try:
            with self.anthropic.messages.stream(
                max_tokens=4096,
                system=self.system_prompt,
                messages=self.messages,
                model=self.model,
            ) as stream:
                full_response = ""
                for text in stream.text_stream:
                    full_response += text
                    yield text
                
                self.messages.append({"role": "assistant", "content": full_response})
        except Exception as e:
            error_message = f"Error getting Anthropic response: {str(e)}"
            self.messages.append({"role": "assistant", "content": error_message})
            yield error_message

    def update_messages(self, user_message: str) -> str:
        self.messages.append({"role": "user", "content": user_message})
        return self.get_anthropic_response_stream()