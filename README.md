# Chat Desktop

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Backend: MCP Client for Brave Search

The backend module provides a modular client for interacting with the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for Brave Search. It allows you to easily integrate Brave Search capabilities into your AI applications, with full support for streaming responses.

### Features

- 🔍 Direct Brave Search API access through MCP
- 🤖 Claude + Brave Search integration for AI-enhanced search
- 📡 Streaming support for real-time responses 
- 🧩 Modular design for easy integration into your applications
- 🛠️ Robust error handling and connection management

### Prerequisites

- Python 3.10 or higher
- Node.js and npm (for the MCP server)
- Brave Search API key (get one from [Brave Search API](https://api.search.brave.com/))
- Anthropic API key (for Claude integration)

### Installation

1. Install the required Python packages:

```bash
pip install mcp anthropic python-dotenv
```

2. Install the Brave Search MCP server package:

```bash
npm install -g @modelcontextprotocol/server-brave-search
```

3. Set up your environment variables:

Create a `.env` file in the same directory as your scripts with the following content:

```
BRAVE_API_KEY=your_brave_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

Replace the placeholders with your actual API keys.

### Usage

#### Basic Usage

```python
from mcp_client import MCPClient
import asyncio

async def main():
    # Initialize the client
    client = MCPClient()
    
    try:
        # Connect to the MCP server
        await client.connect()
        
        # Process a query with Claude and Brave Search
        response = await client.process_query(
            "What were the major AI advancements in 2023?"
        )
        print(response)
        
    finally:
        # Always disconnect when done
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
```

#### Direct Search

To perform a direct search without LLM involvement:

```python
search_results = await client.execute_search("Latest AI news")
print(search_results)
```

#### Streaming Responses

For streaming responses:

```python
async for chunk in client.process_query_stream(
    "What are the latest developments in quantum computing?",
):
    print(chunk, end="", flush=True)
```

#### With Custom Callback

You can provide a callback function to handle chunks as they come:

```python
def handle_chunk(chunk: str):
    # Process each chunk (e.g., update UI)
    print(f"Received chunk: {chunk}")

async for _ in client.process_query_stream(
    "Explain the theory of relativity",
    callback=handle_chunk
):
    pass  # Processing happens in the callback
```

### Troubleshooting

#### Common Issues

1. **Connection Errors**:
   - Make sure npm is installed and in your PATH
   - Check your internet connection
   - Verify that you have access to the npm registry

2. **API Key Issues**:
   - Ensure your Brave Search API key starts with "BSA" and is valid
   - Check that your Anthropic API key is correctly set
   - Don't include "Bearer " or other prefixes in the key values

3. **Tool Call Errors**:
   - Check that the query format matches what the tool expects
   - Ensure the tool name matches exactly what's provided by the server

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
