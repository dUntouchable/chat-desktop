import { NextRequest, NextResponse } from 'next/server';
import { Attachment } from '@/types/chat';

export type ChatWindowId = 'llama' | 'anthropic' | 'openai';

export interface ChatRequestBody {
  message: string;
  windows?: ChatWindowId[]; // Optional array of active window IDs
  attachment?: Attachment;  // Optional attachment
}

export interface StreamChunk {
  model: string;
  chunk: string;
}

// Model to window mapping
const MODEL_TO_WINDOW_MAP: Record<string, ChatWindowId> = {
  'response1': 'llama',
  'response2': 'anthropic',
  'response3': 'openai'
};

export const runtime = 'edge'; // Enable edge runtime for streaming

const FLASK_API_URL = process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://127.0.0.1:5000';
const FETCH_TIMEOUT = 60000; // 60 seconds for initial connection
const STREAM_CHUNK_TIMEOUT = 30000; // 30 seconds between chunks
const MAX_TOTAL_STREAM_DURATION = 180000; // 3 minutes total stream duration
const MAX_MESSAGE_SIZE = 500000; // 500KB max message size

export async function POST(request: NextRequest) {
  // Create AbortController for the fetch request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  const streamStartTime = Date.now();

  try {
    const data: ChatRequestBody = await request.json();
    
    // Check message size to prevent timeouts
    if (data.message && data.message.length > MAX_MESSAGE_SIZE) {
      return new Response(
        JSON.stringify({ 
          error: 'Message too large', 
          details: `Message exceeds maximum size of ${MAX_MESSAGE_SIZE / 1000}KB` 
        }),
        { 
          status: 413, // Payload Too Large
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const flaskUrl = `${FLASK_API_URL}/chat-stream`;
    
    const flaskResponse = await fetch(flaskUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
      signal: controller.signal
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
            if (Date.now() - streamStartTime > MAX_TOTAL_STREAM_DURATION) {
              // Instead of throwing an error, try to finalize gracefully
              // Send a final chunk indicating the timeout
              for (const windowId of Object.values(MODEL_TO_WINDOW_MAP)) {
                if (!data.windows?.length || data.windows.includes(windowId as ChatWindowId)) {
                  const timeoutChunk: StreamChunk = {
                    model: Object.entries(MODEL_TO_WINDOW_MAP).find(([modelKey]) => MODEL_TO_WINDOW_MAP[modelKey] === windowId)?.[0] || '',
                    chunk: "\n\n[Response truncated due to time limit]"
                  };
                  const encodedChunk = `data: ${JSON.stringify(timeoutChunk)}\n\n`;
                  controller.enqueue(new TextEncoder().encode(encodedChunk));
                }
              }
              // Close the stream after sending the timeout message
              break;
            }
            
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
                  
                  // Validate chunk format
                  if (!parsedChunk.model || typeof parsedChunk.model !== 'string') {
                    continue;
                  }
                  
                  if (parsedChunk.chunk === undefined) {
                    continue;
                  }
                  
                  // Get the windowId corresponding to this model
                  const windowId = MODEL_TO_WINDOW_MAP[parsedChunk.model];
                  
                  // Filter based on windows if specified
                  if (!data.windows?.length || 
                      (windowId && data.windows.includes(windowId as ChatWindowId))) {
                    // Encode the parsed chunk as SSE format
                    const encodedChunk = `data: ${JSON.stringify(parsedChunk)}\n\n`;
                    controller.enqueue(new TextEncoder().encode(encodedChunk));
                  }
                } catch {
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
              
              // Get the windowId corresponding to this model
              const windowId = MODEL_TO_WINDOW_MAP[parsedChunk.model];
              
              if (!data.windows?.length || 
                  (windowId && data.windows.includes(windowId as ChatWindowId))) {
                const encodedChunk = `data: ${JSON.stringify(parsedChunk)}\n\n`;
                controller.enqueue(new TextEncoder().encode(encodedChunk));
              }
            } catch {
              // Ignore parsing errors for final chunk
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
    // For timeout errors, provide a more specific response
    if (error instanceof Error && 
        (error.message.includes('timeout') || 
         error.message.includes('aborted') || 
         error.message.includes('exceeded') ||
         error.message.includes('ECONNRESET'))) {
      
      return new Response(
        JSON.stringify({ 
          error: 'Stream timeout', 
          details: 'The response generation took too long and was interrupted. Try a simpler query.'
        }),
        { 
          status: 408, // Request Timeout
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}