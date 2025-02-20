import { NextRequest, NextResponse } from 'next/server';

export type ChatWindowId = 'llama' | 'anthropic' | 'openai';

export interface ChatRequestBody {
  message: string;
  activeWindows?: ChatWindowId[]; // Optional array of active window IDs
}

export interface StreamChunk {
  model: string;
  chunk: string;
}

export const runtime = 'edge'; // Enable edge runtime for streaming

const FLASK_API_URL = process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://127.0.0.1:5000';
const FETCH_TIMEOUT = 25000; // 25 seconds for initial connection
const STREAM_CHUNK_TIMEOUT = 15000; // 15 seconds between chunks
const MAX_TOTAL_STREAM_DURATION = 30000; // 30 seconds total stream duration

export async function POST(request: NextRequest) {
  // Create AbortController for the fetch request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  const streamStartTime = Date.now();

  try {
    const data: ChatRequestBody = await request.json();
    let flaskUrl = `${FLASK_API_URL}/chat-stream`;
    
    const flaskResponse = await fetch(flaskUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });

    clearTimeout(timeoutId);

    if (!flaskResponse.ok) {
      throw new Error(`Flask server error: ${flaskResponse.status}`);
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = flaskResponse.body!.getReader();
        const textDecoder = new TextDecoder();
        let chunkTimeoutId: NodeJS.Timeout | undefined = undefined;
        let buffer = '';
        
        const resetChunkTimeout = () => {
          if (chunkTimeoutId) {
            clearTimeout(chunkTimeoutId);
          }
          chunkTimeoutId = setTimeout(() => {
            reader.cancel('Stream chunk timeout exceeded');
            controller.error(new Error('No data received within the chunk timeout period'));
          }, STREAM_CHUNK_TIMEOUT);
        };

        try {
          while (true) {
            // Check total stream duration
            // if (Date.now() - streamStartTime > MAX_TOTAL_STREAM_DURATION) {
            //   throw new Error('Maximum stream duration exceeded');
            // }
            // Reset timeout for next chunk
            resetChunkTimeout();
            const { done, value } = await reader.read();

            if (done) break;

            buffer += textDecoder.decode(value, { stream: true });
            
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim() && line.startsWith('data: ')) {
                try {
                  // Remove 'data: ' prefix before parsing
                  const jsonStr = line.slice(5).trim();
                  const parsedChunk: StreamChunk = JSON.parse(jsonStr);
                  
                  // Filter based on activeWindows if specified
                  if (!data.activeWindows?.length || 
                      data.activeWindows.includes(parsedChunk.model as ChatWindowId)) {
                    // Encode the parsed chunk as SSE format
                    const encodedChunk = `data: ${JSON.stringify(parsedChunk)}\n\n`;
                    controller.enqueue(new TextEncoder().encode(encodedChunk));
                  }
                } catch (e) {
                  console.error('Error parsing chunk:', e);
                  // Continue processing other chunks even if one fails
                }
              }
            }
          }

          // Handle the final chunk separately
          if (buffer.trim() && buffer.startsWith('data: ')) {
            try {
              const jsonStr = buffer.slice(5).trim();
              const parsedChunk: StreamChunk = JSON.parse(jsonStr);
              
              if (!data.activeWindows?.length || 
                  data.activeWindows.includes(parsedChunk.model as ChatWindowId)) {
                const encodedChunk = `data: ${JSON.stringify(parsedChunk)}\n\n`;
                controller.enqueue(new TextEncoder().encode(encodedChunk));
              }
            } catch (e) {
              console.error('Error parsing final chunk:', e);
            }
          }
          
          if (chunkTimeoutId) clearTimeout(chunkTimeoutId);
          controller.close();
        } catch (error) {
          if (chunkTimeoutId) clearTimeout(chunkTimeoutId);
          controller.error(error);
        }
      }
    });

    return new NextResponse(stream, {
      status: flaskResponse.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('API Route Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}