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
        
    def update_messages(self, user_message):
        self.messages.append({"role": "user", "content": user_message})
        return self.get_openai_response()