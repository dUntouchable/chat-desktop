// AutoExpandingInput.tsx
import React, { useRef, useEffect } from 'react';

interface AutoExpandingInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div 
      className={`fixed bottom-0 transition-all duration-300 ${
        isPanelOpen ? 'left-64' : 'left-12'
      } right-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-lg`}
    >
      <div className="max-w-8xl mx-auto w-full">
        <form onSubmit={onSubmit} className="flex gap-4 max-w-full">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={onChange}
            onKeyDown={handleKeyDown}
            rows={1}
            className="flex-1 p-3 rounded-lg border border-gray-300 dark:border-gray-600 
                    dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 
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
            disabled={isLoading}
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AutoExpandingInput;
