from openai import OpenAI 

class OpenaiClient:
    def __init__(self, api_key, system_prompt, model = "gpt-4o-mini"):
        self.api_key = api_key
        self.openai = OpenAI(api_key=self.api_key)
        self.model = model
        self.messages = [
            {
                "role": "system",
                "content": system_prompt
            }
        ]

    def get_openai_response(self):
        try:
            completion = self.openai.chat.completions.create(
                model=self.model,
                messages=self.messages,
            )
            assistant_message = completion.choices[0].message.content
            self.messages.append({"role": "assistant", "content": assistant_message})
            return assistant_message
        except Exception as e:
            print(f"OpenAI API Error: {str(e)}")
            self.messages.append({"role": "assistant", "content": f"Error getting Llama response: {str(e)}"})
            return f"Error getting OpenAI response: {str(e)}"
        
    def update_messages(self, user_message):
        self.messages.append({"role": "user", "content": user_message})
        return self.get_openai_response()