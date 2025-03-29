'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react';

import AutoExpandingInput from '@/components/AutoExpandingInput';
import SidePanel from '@/components/SidePanel';
import AttachmentViewer from '@/components/AttachmentViewer';
import { Attachment, ChatMessage, ChatWindow } from '@/types/chat';
import { getWindowId } from '@/utils/modelMapping';

const DEFAULT_WINDOWS: ChatWindow[] = [
  { id: 'llama', title: 'falcon3:10b', messages: [], isVisible: true },
  // { id: 'llama', title: 'DeepSeek r1:1.5b', messages: [], isVisible: true },
  { id: 'anthropic', title: 'Claude 3.5 Sonnet', messages: [], isVisible: true },
  { id: 'openai', title: 'ChatGPT gpt-4o-mini', messages: [], isVisible: true }
];

const parseMarkdown = (text: string): React.ReactNode[] => {
  // First split by code blocks to preserve them
  const segments = text.split(/(```[\s\S]*?```)/);
  
  return segments.map((segment: string, index: number) => {
    // Handle code blocks
    if (segment.startsWith('```') && segment.endsWith('```')) {
      const code = segment.slice(3, -3);
      return (
        <pre key={index} className="lightRed text-black-100 p-3 rounded my-2 overflow-x-auto">
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
        })}
      </React.Fragment>
    );
  });
};

const processInlineCode = (text: string): React.ReactNode[] => {
  const segments = text.split(/(`[^`]+`)/);
  return segments.map((segment, index) => {
    if (segment.startsWith('`') && segment.endsWith('`')) {
      return (
        <code key={index} className="bg-gray-100 text-red-600 px-1 py-0.5 rounded text-sm">
          {segment.slice(1, -1)}
        </code>
      );
    }
    return segment;
  });
};

// Modified helper function to process both bold text and inline code
const processBoldText = (text: string): React.ReactNode[] => {
  // First process bold text
  const boldSegments = text.split(/(\*\*.*?\*\*)/g);
  const processedBold: React.ReactNode[] = boldSegments.map((segment, index) => {
    if (typeof segment === 'string' && segment.startsWith('**') && segment.endsWith('**')) {
      return (
        <strong key={index} className="font-bold">
          {segment.slice(2, -2)}
        </strong>
      );
    }
    return segment;
  });

  // Then process inline code within non-bold segments
  return processedBold.map((segment, index) => {
    if (React.isValidElement(segment)) {
      return segment; // Return bold elements as-is
    }
    if (typeof segment === 'string') {
      // Process remaining text for inline code
      const codeProcessed = processInlineCode(segment);
      return <React.Fragment key={index}>{codeProcessed}</React.Fragment>;
    }
    return segment;
  });
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

// Main Chat Interface Component
export default function ChatInterface() {
  const [inputMessage, setInputMessage] = useState('');
  const [windows, setWindows] = useState<ChatWindow[]>(DEFAULT_WINDOWS);
  const [isLoading, setIsLoading] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  
  // Attachments state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [viewingAttachment, setViewingAttachment] = useState<Attachment | null>(null);
  
  const responseAccumulator = useRef<Record<string, string>>({
    llama: '',
    anthropic: '',
    openai: ''
  });

  useEffect(() => {
    // Function to check if there are unsaved messages
    const hasActiveChat = () => {
      return windows.some(window => window.messages.length > 0);
    };

    // Handle browser navigation (back/forward) and page refresh
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasActiveChat()) {
        const message = 'You have active chat messages. Are you sure you want to leave?';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    // Handle popstate event (browser back/forward buttons)
    const handlePopState = () => {
      if (hasActiveChat()) {
        if (!window.confirm('You have active chat messages. Are you sure you want to leave this page?')) {
          // Stay on the current page
          window.history.pushState(null, '', window.location.href);
        }
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    
    // Push initial state
    window.history.pushState(null, '', window.location.href);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [windows]); // Add windows as dependency to check for messages


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

  const handleSubmit = async (e: React.FormEvent, attachment?: Attachment) => {
    e.preventDefault();
    
    if (!inputMessage.trim() && !attachment) return;
    if (isLoading) return;

    // Save the attachment to the attachments list if it exists
    if (attachment) {
      // Check if attachment with same ID already exists
      const existingAttachment = attachments.find(att => att.id === attachment.id);
      if (existingAttachment) {
        // If duplicate ID exists, create a new ID by appending a timestamp
        const newAttachment = {
          ...attachment,
          id: `${attachment.id}-${Date.now()}`
        };
        setAttachments(prev => [...prev, newAttachment]);
      } else {
        setAttachments(prev => [...prev, attachment]);
      }
    }

    responseAccumulator.current = {
      llama: '',
      anthropic: '',
      openai: ''
    };

    // Create user message - show just "Sent attachment" if there's no text but there's an attachment
    const displayText = inputMessage.trim() || (attachment ? "Sent attachment" : "");
    const userMessage: ChatMessage = { 
      text: displayText, 
      sender: 'user'
    };

    // Use the original attachment content or the input message for the API call
    const contentToSend = attachment ? attachment.content : inputMessage;

    const visibleWindowIds = windows
    .filter(w => w.isVisible)
    .map(w => w.id);
    
    setWindows(prev => prev.map(window => ({
      ...window,
      messages: window.isVisible ? [...window.messages, userMessage] : window.messages
    })));
    
    setInputMessage('');
    setIsLoading(true);

    // Create an AbortController to handle request timeouts
    const controller = new AbortController();
    // Set a timeout to abort the request if it takes too long
    const timeoutId = setTimeout(() => controller.abort(), 4 * 60 * 1000); // 4 minute timeout

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: contentToSend,
          windows: visibleWindowIds
        }),
        signal: controller.signal // Add the signal to enable request cancellation
      });
      
      if (!response.ok) {
        if (response.status === 413) {
          // Handle "Payload Too Large" errors specifically
          const errorData = await response.json();
          throw new Error(errorData.details || 'Message is too large to process');
        }
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
              const windowId = getWindowId(data.model);

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
            } catch {
              // Silent error handling
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
        } catch {
          // Silent error handling
        }
      }

    } catch (error) {
      // Create a more informative error message
      let errorText = "Sorry, there was an error processing your request.";
      
      if (error instanceof Error) {
        // Check for specific error types
        if (error.name === 'AbortError') {
          errorText = "The request was cancelled because it took too long. Try simplifying your query.";
        } else if (error.message.includes('ECONNRESET') || error.message.includes('aborted')) {
          errorText = "The connection was reset. This might be due to a timeout or server issue.";
        } else if (error.message.includes('Maximum stream duration exceeded') || 
            error.message.includes('time limit') ||
            error.message.includes('timeout')) {
          errorText = "The response took too long to generate. Try simplifying your query or try again later.";
        } else if (error.message.includes('too large')) {
          errorText = "Your message is too large. Please shorten it and try again.";
        } else if (error.message.includes('HTTP error')) {
          errorText = `Server error: ${error.message}. Please try again later.`;
        }
      }
      
      const errorMessage: ChatMessage = { 
        text: errorText,
        sender: 'bot'
      };
      
      setWindows(prev => prev.map(window => ({
        ...window,
        messages: window.isVisible ? [...window.messages, errorMessage] : window.messages
      })));
    } finally {
      setIsLoading(false);
      clearTimeout(timeoutId); // Clean up the timeout
    }
  };

  const handleToggleWindow = (id: string) => {
    setWindows(prev => prev.map(window => 
      window.id === id ? { ...window, isVisible: !window.isVisible } : window
    ));
  };

  const handleViewAttachment = (attachment: Attachment) => {
    setViewingAttachment(attachment);
  };

  const handleDeleteAttachment = (attachmentId: string) => {
    setAttachments(prev => prev.filter(att => att.id !== attachmentId));
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
          attachments={attachments}
          onViewAttachment={handleViewAttachment}
          onDeleteAttachment={handleDeleteAttachment}
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
      
      {/* Attachment Viewer */}
      {viewingAttachment && (
        <AttachmentViewer 
          attachment={viewingAttachment} 
          onClose={() => setViewingAttachment(null)}
        />
      )}
    </div>
  );
}