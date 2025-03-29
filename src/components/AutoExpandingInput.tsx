import React, { useRef, useEffect, useState } from 'react';
import { Attachment } from '@/types/chat';
import { v4 as uuidv4 } from 'uuid';

interface AutoExpandingInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: React.FormEvent, attachment?: Attachment) => void;
  isLoading: boolean;
  isPanelOpen: boolean;
}

const AutoExpandingInput: React.FC<AutoExpandingInputProps> = ({
  value,
  onChange,
  onSubmit,
  isLoading,
  isPanelOpen
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e);
  };
  
  const [error, setError] = useState<string | null>(null);
  
  const MAX_DIRECT_INPUT_LENGTH = 500;
  const MAX_ATTACHMENT_SIZE = 200000; // Reduced to 200KB to be safely below API limit
  const MAX_TOTAL_MESSAGE_SIZE = 400000; // 400KB total message size limit

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  // Reset error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const detectContentType = (content: string): 'text' | 'code' => {
    // Simple detection - if contains common programming symbols
    const codePatterns = /[{}\[\]()=><!;]/g;
    return codePatterns.test(content) ? 'code' : 'text';
  };

  const formatPreview = (content: string, type: 'text' | 'code'): string => {
    const preview = content.slice(0, 100);
    return type === 'code' 
      ? `Code snippet (${content.length} characters)`
      : `${preview}${content.length > 100 ? '...' : ''}`;
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    try {
      // Handle both text and files
      if (e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file.size > MAX_ATTACHMENT_SIZE) {
          e.preventDefault(); // Prevent the file content from being pasted
          setError(`File too large. Maximum size is ${MAX_ATTACHMENT_SIZE / 1000}KB`);
          return;
        }
        
        // Handle file attachment
        const content = await file.text();
        if (content.length > MAX_ATTACHMENT_SIZE) {
          e.preventDefault();
          setError(`File content too large. Maximum size is ${MAX_ATTACHMENT_SIZE / 1000}KB`);
          return;
        }
        
        e.preventDefault(); // Prevent the file content from being pasted into the textarea
        handleAttachment(content, 'file', file.name);
      } else {
        const pastedText = e.clipboardData.getData('text');
        if (pastedText.length > MAX_DIRECT_INPUT_LENGTH) {
          // Check if the pasted text is too large even for an attachment
          if (pastedText.length > MAX_ATTACHMENT_SIZE) {
            e.preventDefault();
            setError(`Pasted content too large. Maximum size is ${MAX_ATTACHMENT_SIZE / 1000}KB`);
            return;
          }
          
          e.preventDefault(); // Prevent the text from being pasted into the textarea
          const contentType = detectContentType(pastedText);
          handleAttachment(pastedText, contentType);
        }
      }
    } catch (err) {
      setError('Error processing paste content');
      console.error(err);
    }
  };

  const handleAttachment = (content: string, type: Attachment['type'], fileName?: string) => {
    // Ensure we generate a truly unique ID for each attachment
    const uniqueId = uuidv4() + '-' + Date.now();
    
    const newAttachment: Attachment = {
      id: uniqueId,
      content,
      type,
      size: content.length,
      preview: fileName || formatPreview(content, type as 'text' | 'code')
    };
    setAttachment(newAttachment);
  };

  const removeAttachment = () => {
    setAttachment(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Allow submission if either text or attachment is present
    if (!value.trim() && !attachment) {
      setError('Please enter a message or add an attachment');
      return;
    }
    
    // Check total message size
    const totalSize = value.length + (attachment ? attachment.size : 0);
    if (totalSize > MAX_TOTAL_MESSAGE_SIZE) {
      setError(`Message too large. Maximum size is ${MAX_TOTAL_MESSAGE_SIZE / 1000}KB`);
      return;
    }
    
    // Call onSubmit with the attachment if present
    onSubmit(e, attachment || undefined);
    
    // Don't clear attachment here - let the parent component decide when to clear it
  };

  return (
    <div 
      className={`fixed bottom-0 transition-all duration-300 ${
        isPanelOpen ? 'left-64' : 'left-12'
      } right-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-lg`}
    >
      <div className="max-w-8xl mx-auto w-full">
        {error && (
          <div className="mb-2 p-2 bg-red-100 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        
        {attachment && (
          <div className={`mb-2 p-3 ${
            attachment.type === 'code' ? 'bg-gray-50' : 'bg-white'
          } rounded-lg relative border border-gray-200`}>
            <button
              onClick={removeAttachment}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 
                       dark:text-gray-400 dark:hover:text-gray-200"
              aria-label="Remove attachment"
            >
              ×
            </button>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded ${
                attachment.type === 'code' ? 'bg-blue-500' : 
                attachment.type === 'file' ? 'bg-green-500' : 'bg-gray-500'
              } text-white`}>
                {attachment.type.toUpperCase()}
              </span>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {attachment.preview}
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-4 max-w-full">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            className="flex-1 p-3 rounded-lg border border-gray-300
                    bg-white text-gray-800 focus:outline-none focus:ring-2 
                    focus:ring-blue-500 dark:focus:ring-blue-400 resize-none overflow-hidden
                    min-h-[48px] w-0"
            style={{ 
              lineHeight: '1.5',
              maxHeight: '150px'
            }}
            placeholder="Type your message..."
            disabled={isLoading}
          />
          <button
            type="submit"
            className={`px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 
                      focus:outline-none focus:ring-2 focus:ring-blue-500 
                      transition-colors duration-200 flex-shrink-0 ${
                        isLoading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
            disabled={isLoading || (!value.trim() && !attachment)}
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AutoExpandingInput;