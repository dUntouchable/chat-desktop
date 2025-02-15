import { NextRequest, NextResponse } from 'next/server';

export interface ChatRequestBody {
  message: string;
}

export interface ChatResponseBody {
  response1?: string;
  response2?: string;
  response3?: string;
  error?: string;
}

export interface FlaskResponse {
  response1: string;
  response2: string;
  response3: string;
}

const FLASK_API_URL = process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://127.0.0.1:5000';

export async function GET(
  request: NextRequest
): Promise<NextResponse<ChatResponseBody>> {
  try {
    // Get message from query parameters
    const searchParams = request.nextUrl.searchParams;
    const message = searchParams.get('message');

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Call Flask backend
    const response = await fetch(`${FLASK_API_URL}/chat?message=${encodeURIComponent(message)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    
    if (!response.ok) {
      throw new Error(`Flask server error: ${response.status}`);
    }
    
    const data = await response.json() as FlaskResponse;

    // Return the response
    return NextResponse.json({
      response1: data.response1,
      response2: data.response2,
      response3: data.response3,
    });

  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// You can also add a POST method if needed in the future
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

    const response = await fetch(`${FLASK_API_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: body.message }),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Flask server error: ${response.status}`);
    }

    const data = await response.json() as FlaskResponse;

    return NextResponse.json({
      response1: data.response1,
      response2: data.response2,
      response3: data.response3,
    });

  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}


