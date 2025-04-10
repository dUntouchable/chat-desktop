# Chat Application Backend

This is the backend for the multi-agent chat application, built with FastAPI and the Pydantic AI library.

## Features

- Multi-agent system using Pydantic AI
- Support for multiple LLM providers (OpenAI, Anthropic, local LLMs)
- Web search capability via Brave Search integration
- Streaming responses using SSE (Server-Sent Events)
- MCP (Model Completion Protocol) server for enhanced AI capabilities

## Setup

1. Install the required dependencies:

```bash
pip install -r requirements.txt
```

2. Create a `.env` file based on `.env.example` and add your API keys:

```
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENAI_API_KEY=your_openai_api_key
BRAVE_API_KEY=your_brave_search_api_key
```

## Running the Server

You can run the server using either of these methods:

### Option 1: Using the start script

```bash
python start_server.py
```

### Option 2: Using uvicorn directly

```bash
uvicorn app:app --host 0.0.0.0 --port 5000 --reload
```

The server will be available at http://localhost:5000.

## API Endpoints

- `GET /chat` - Standard chat endpoint that returns a JSON response
- `POST /chat-stream` - Streaming chat endpoint that returns SSE responses
- `GET /health` - Health check endpoint

## Multi-Agent System

The backend uses a multi-agent system with different agents for different types of tasks:

- Research agent: Finds and provides accurate information with sources
- Coding agent: Generates clean, efficient code with explanations
- Creative agent: Creates imaginative content

The system automatically classifies queries and routes them to the appropriate agent. 