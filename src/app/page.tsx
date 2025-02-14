'use client'
import React, { useState, useRef, useEffect } from 'react';
import AutoExpandingInput from '@/components/AutoExpandingInput';

interface ChatMessage {
  text: string;
  sender: 'user' | 'bot';
}

const parseMarkdown = (text: string): React.ReactNode[] => {
  // First split by code blocks to preserve them
  const segments = text.split(/(```[\s\S]*?```)/);
  
  return segments.map((segment: string, index: number) => {
    // Handle code blocks
    if (segment.startsWith('```') && segment.endsWith('```')) {
      const code = segment.slice(3, -3);
      return (
        <pre key={index} className="bg-gray-900 text-gray-100 p-3 rounded my-2 overflow-x-auto">
          <code>{code}</code>
        </pre>
      );
    }

    // Split the text into paragraphs (double newlines)
    const paragraphs = segment.split(/\n\s*\n/);
    
    return (
      <React.Fragment key={index}>
        {paragraphs.map((paragraph, paragraphIndex) => {
          // Skip empty paragraphs
          if (!paragraph.trim()) return null;

          // Process the paragraph for headers and other formatting
          const lines = paragraph.split('\n');
          const processedLines = lines.map((line: string, lineIndex: number) => {
            // Handle headers
            if (line.startsWith('### ')) {
              return (
                <h3 key={lineIndex} className="text-xl font-bold mt-4 mb-2">
                  {processBoldText(line.slice(4))}
                </h3>
              );
            } else if (line.startsWith('## ')) {
              return (
                <h2 key={lineIndex} className="text-2xl font-bold mt-4 mb-2">
                  {processBoldText(line.slice(3))}
                </h2>
              );
            } else if (line.startsWith('# ')) {
              return (
                <h1 key={lineIndex} className="text-3xl font-bold mt-4 mb-2">
                  {processBoldText(line.slice(2))}
                </h1>
              );
            }

            // Handle regular lines within a paragraph
            return (
              <React.Fragment key={lineIndex}>
                {processBoldText(line)}
                {lineIndex < lines.length - 1 && <br />}
              </React.Fragment>
            );
          });

          const hasHeaders = lines.some(line => 
            line.startsWith('# ') || 
            line.startsWith('## ') || 
            line.startsWith('### ')
          );

          return hasHeaders ? (
            <div key={paragraphIndex} className="mb-4 last:mb-0">
              {processedLines}
            </div>
          ) : (
            <p key={paragraphIndex} className="mb-4 last:mb-0">
              {processedLines}
            </p>
          );

          // Wrap each paragraph in a p tag with proper spacing
          return (
            <p key={paragraphIndex} className="mb-4 last:mb-0">
              {processedLines}
            </p>
          );
        })}
      </React.Fragment>
    );
  });
};

// Helper function to process bold text
const processBoldText = (text: string): React.ReactNode[] => {
  const boldSegments = text.split(/(\*\*.*?\*\*)/g);
  return boldSegments.map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      return (
        <strong key={index} className="font-bold">
          {segment.slice(2, -2)}
        </strong>
      );
    }
    return segment;
  });
};



// Separate ChatWindow component
const ChatWindow: React.FC<{ messages: ChatMessage[]; title: string }> = ({ messages, title }) => {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <div className="py-3 px-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold dark:text-white">{title}</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg p-3 ${
                  message.sender === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">
                  {parseMarkdown(message.text)}
                </div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>
    </div>
  );
};

// Error Boundary Component
class ChatErrorBoundary extends React.Component<{ children: React.ReactNode }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-red-500">
          Something went wrong. Please refresh the page.
        </div>
      );
    }

    return this.props.children;
  }
}

// Main Chat Interface Component
export default function ChatInterface() {
  const [inputMessage, setInputMessage] = useState('');
  const [chatMessages1, setChatMessages1] = useState<ChatMessage[]>([]);
  const [chatMessages2, setChatMessages2] = useState<ChatMessage[]>([]);
  const [chatMessages3, setChatMessages3] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = { text: inputMessage, sender: 'user' };
    
    // Add user message immediately
    setChatMessages1(prev => [...prev, userMessage]);
    setChatMessages2(prev => [...prev, userMessage]);
    setChatMessages3(prev => [...prev, userMessage]);
    
    setInputMessage(''); // Clear input immediately
    setIsLoading(true);

    try {
      const response = await fetch(`/api/chat?message=${encodeURIComponent(inputMessage)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }
      
      // Add bot responses
      if (data.response1) {
        setChatMessages1(prev => [...prev, { text: data.response1, sender: 'bot' }]);
      }
      if (data.response2) {
        setChatMessages2(prev => [...prev, { text: data.response2, sender: 'bot' }]);
      }
      if (data.response3) {
        setChatMessages3(prev => [...prev, { text: data.response3, sender: 'bot' }]);
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: ChatMessage = { 
        text: "Sorry, there was an error processing your request. Please try again.",
        sender: 'bot'
      };
      setChatMessages1(prev => [...prev, errorMessage]);
      setChatMessages2(prev => [...prev, errorMessage]);
      setChatMessages3(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900 pb-[100px]">
      <div className="flex-1 p-4 overflow-hidden relative">
        <ChatErrorBoundary>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChatWindow messages={chatMessages1} title="Llama" />
            <ChatWindow messages={chatMessages2} title="Anthropic" />
            <ChatWindow messages={chatMessages3} title="OpenAI" />
          </div>
        </ChatErrorBoundary>
      </div>
      
      <AutoExpandingInput
        value={inputMessage}
        onChange={(e) => setInputMessage(e.target.value)}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </div>
  );
}
