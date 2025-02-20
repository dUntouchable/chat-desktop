'use client'
import React, { useState, useRef, useEffect, useCallback, ReactNode } from 'react';

import AutoExpandingInput from '@/components/AutoExpandingInput';
import SidePanel from '@/components/SidePanel';
import { ChatMessage, ChatWindow } from '@/types/chat';

const DEFAULT_WINDOWS: ChatWindow[] = [
  { id: 'llama', title: 'Qwen 2.5:3b', messages: [], isVisible: true },
  { id: 'anthropic', title: 'Claude 3.5 Sonnet', messages: [], isVisible: true },
  { id: 'openai', title: 'ChatGPT gpt-4o-mini', messages: [], isVisible: true }
];

const MODEL_TO_WINDOW_MAP: Record<string, string> = {
  'response1': 'llama',
  'response2': 'anthropic',
  'response3': 'openai'
};


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
                  {processThinkTags(processBoldText(line.slice(4)))}
                </h3>
              );
            } else if (line.startsWith('## ')) {
              return (
                <h2 key={lineIndex} className="text-2xl font-bold mt-4 mb-2">
                  {processThinkTags(processBoldText(line.slice(3)))}
                </h2>
              );
            } else if (line.startsWith('# ')) {
              return (
                <h1 key={lineIndex} className="text-3xl font-bold mt-4 mb-2">
                  {processThinkTags(processBoldText(line.slice(2)))}
                </h1>
              );
            }

            // Handle regular lines within a paragraph
            return (
              <React.Fragment key={lineIndex}>
                {processThinkTags(processBoldText(line))}
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

const processThinkTags = (content: ReactNode): ReactNode => {
  if (typeof content === 'string') {
    const thinkSegments = content.split(/(<think>.*?<\/think>)/gs);
    return thinkSegments.map((segment, index) => {
      if (segment.startsWith('<think>') && segment.endsWith('</think>')) {
        return (
          <span key={index} className="italic text-blue-500">
            {segment.slice(7, -8)}
          </span>
        );
      }
      return segment;
    });
  }
  return content;
};





// Separate ChatWindow component
const ChatWindowComponent: React.FC<{ messages: ChatMessage[]; title: string }> = ({ messages, title }) => {
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
  const [windows, setWindows] = useState<ChatWindow[]>(DEFAULT_WINDOWS);
  const [isLoading, setIsLoading] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const responseAccumulator = useRef<Record<string, string>>({
    llama: '',
    anthropic: '',
    openai: ''
  });

  const updateWindowWithMessage = useCallback((windowId: string, message: ChatMessage) => {
    setWindows(prev => prev.map(window => {
      if (window.id === windowId && window.isVisible) {
        return {
          ...window,
          messages: [...window.messages, message]
        };
      }
      return window;
    }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    responseAccumulator.current = {
      llama: '',
      anthropic: '',
      openai: ''
    };

    const userMessage: ChatMessage = { text: inputMessage, sender: 'user' };

    const visibleWindowIds = windows
    .filter(w => w.isVisible)
    .map(w => w.id);
    
    setWindows(prev => prev.map(window => ({
      ...window,
      messages: window.isVisible ? [...window.messages, userMessage] : window.messages
    })));
    
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: inputMessage,
          windows: visibleWindowIds
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        // Append new chunk to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(5).trim(); // Remove 'data: ' prefix
              const data = JSON.parse(jsonStr);
              const windowId = MODEL_TO_WINDOW_MAP[data.model];

              // Process each window's response
              if (windowId && visibleWindowIds.includes(windowId)) {
                responseAccumulator.current[windowId] += data.chunk;
                
                setWindows(prev => prev.map(window => {
                  if (window.id === windowId && window.isVisible) {
                    const messages = [...window.messages];
                    const lastMessage = messages[messages.length - 1];
                    if (lastMessage?.sender === 'bot') {
                      messages[messages.length - 1] = {
                        ...lastMessage,
                        text: responseAccumulator.current[windowId]
                      };
                    } else {
                      messages.push({
                        text: responseAccumulator.current[windowId],
                        sender: 'bot'
                      });
                    }
                    return { ...window, messages };
                  }
                  return window;
                }));
              }        
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
            }
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim() && buffer.startsWith('data: ')) {
        try {
          const jsonStr = buffer.slice(5).trim();
          const data = JSON.parse(jsonStr);
          
          for (const windowId of visibleWindowIds) {
            if (data[windowId]) {
              const botMessage: ChatMessage = {
                text: data[windowId],
                sender: 'bot'
              };
              updateWindowWithMessage(windowId, botMessage);
            }
          }
        } catch (parseError) {
          console.error('Error parsing final SSE data:', parseError);
        }
      }

    } catch (error) {
      console.error('Error:', error);
      const errorMessage: ChatMessage = { 
        text: "Sorry, there was an error processing your request. Please try again.",
        sender: 'bot'
      };
      
      setWindows(prev => prev.map(window => ({
        ...window,
        messages: window.isVisible ? [...window.messages, errorMessage] : window.messages
      })));
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleWindow = (id: string) => {
    setWindows(prev => prev.map(window => 
      window.id === id ? { ...window, isVisible: !window.isVisible } : window
    ));
  };

  const visibleWindows = windows.filter(w => w.isVisible);
  const gridCols = visibleWindows.length > 0 ? visibleWindows.length : 1;

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900 pb-[100px]">
      <div className="flex-1 overflow-hidden relative">
        <SidePanel
          windows={windows}
          onToggleWindow={handleToggleWindow}
          isOpen={isPanelOpen}
          onTogglePanel={() => setIsPanelOpen(!isPanelOpen)}
        />
        
        <div className={`transition-all duration-300 ${isPanelOpen ? 'ml-64' : 'ml-12'}`}>
          <div className="p-4">
            <div 
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`
              }}
            >
              {visibleWindows.map(window => (
                <ChatWindowComponent
                  key={window.id}
                  messages={window.messages}
                  title={window.title}
                />
              ))}
            </div>
          </div>
        </div>
        <AutoExpandingInput
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          isPanelOpen={isPanelOpen}
        />
      </div>
    </div>
  );
}