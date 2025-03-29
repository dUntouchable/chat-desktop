import React from 'react';
import { X } from 'lucide-react';
import { Attachment } from '@/types/chat';

interface AttachmentViewerProps {
  attachment: Attachment | null;
  onClose: () => void;
}

const AttachmentViewer: React.FC<AttachmentViewerProps> = ({ attachment, onClose }) => {
  if (!attachment) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded ${
              attachment.type === 'code' ? 'bg-blue-500' : 
              attachment.type === 'file' ? 'bg-green-500' : 'bg-gray-500'
            } text-white`}>
              {attachment.type.toUpperCase()}
            </span>
            <h3 className="text-lg font-medium dark:text-white">{attachment.preview}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-4">
          {attachment.type === 'code' ? (
            <pre className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-auto text-sm">
              <code>{attachment.content}</code>
            </pre>
          ) : (
            <div className="whitespace-pre-wrap break-words dark:text-white">
              {attachment.content}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AttachmentViewer; 