// app/api/chat/route.tsx
import { NextRequest, NextResponse } from 'next/server';

export type ChatWindowId = 'llama' | 'anthropic' | 'openai';

export interface ChatRequestBody {
  message: string;
  activeWindows?: ChatWindowId[]; // Optional array of active window IDs
}

export interface ChatResponseBody {
  [key: string]: string | undefined; // Dynamic response fields
  error?: string;
}

export interface FlaskResponse {
  [key: string]: string; // Dynamic response fields from Flask
}

const RESPONSE_KEY_MAP: Record<ChatWindowId, string> = {
  llama: 'response1',
  anthropic: 'response2',
  openai: 'response3'
};

const FLASK_API_URL = process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://127.0.0.1:5000';

export async function GET(
  request: NextRequest
): Promise<NextResponse<ChatResponseBody>> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const message = searchParams.get('message');
    const activeWindows = searchParams.get('activeWindows')?.split(',') as ChatWindowId[];

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Build Flask API URL with active windows parameter
    let flaskUrl = `${FLASK_API_URL}/chat?message=${encodeURIComponent(message)}`;
    if (activeWindows?.length) {
      flaskUrl += `&windows=${activeWindows.join(',')}`;
    }

    const response = await fetch(flaskUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Flask server error: ${response.status}`);
    }

    const flaskData = await response.json() as FlaskResponse;
    
    // Transform response based on active windows
    const responseData: ChatResponseBody = {};
    
    // If activeWindows is provided, only include those responses
    if (activeWindows?.length) {
      activeWindows.forEach(windowId => {
        const flaskKey = RESPONSE_KEY_MAP[windowId];
        if (flaskData[flaskKey]) {
          responseData[windowId] = flaskData[flaskKey];
        }
      });
    } else {
      // Fallback to including all responses
      Object.entries(RESPONSE_KEY_MAP).forEach(([windowId, flaskKey]) => {
        if (flaskData[flaskKey]) {
          responseData[windowId] = flaskData[flaskKey];
        }
      });
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ChatResponseBody>> {
  try {
    const body = await request.json() as ChatRequestBody;
    
    if (!body.message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Build request body with active windows
    const flaskBody: any = {
      message: body.message,
    };
    if (body.activeWindows?.length) {
      flaskBody.windows = body.activeWindows;
    }

    const response = await fetch(`${FLASK_API_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(flaskBody),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Flask server error: ${response.status}`);
    }

    const flaskData = await response.json() as FlaskResponse;
    
    // Transform response based on active windows
    const responseData: ChatResponseBody = {};
    
    if (body.activeWindows?.length) {
      body.activeWindows.forEach(windowId => {
        const flaskKey = RESPONSE_KEY_MAP[windowId];
        if (flaskData[flaskKey]) {
          responseData[windowId] = flaskData[flaskKey];
        }
      });
    } else {
      Object.entries(RESPONSE_KEY_MAP).forEach(([windowId, flaskKey]) => {
        if (flaskData[flaskKey]) {
          responseData[windowId] = flaskData[flaskKey];
        }
      });
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}