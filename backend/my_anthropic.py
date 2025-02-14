from anthropic import Anthropic

class AnthropicClient:
    def __init__(self, api_key, system_prompt, model = "claude-3-5-sonnet-latest"):
        self.api_key = api_key
        self.anthropic = Anthropic(api_key=self.api_key)
        self.model = model
        self.messages = []
        self.system_prompt = system_prompt

    def get_anthropic_response(self):
        try:
            response_message = self.anthropic.messages.create(
                max_tokens=4096,
                system=self.system_prompt,
                messages=self.messages,
                model=self.model,
            )
            assistant_message =  response_message.content[0].text
            self.messages.append({"role": "assistant", "content": assistant_message})
            return assistant_message
        except Exception as e:
            print(f"Anthropic API Error: {str(e)}")
            self.messages.append({"role": "assistant", "content": f"Error getting Llama response: {str(e)}"})
            return f"Error getting Anthropic response: {str(e)}"
        
    def update_messages(self, user_message):
        self.messages.append({"role": "user", "content": user_message})
        return self.get_anthropic_response()
