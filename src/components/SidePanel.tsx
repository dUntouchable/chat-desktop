import { PanelLeftClose, PanelLeftOpen, Eye, X, Search } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Switch } from "./ui/switch";
import { Attachment, ChatWindow } from '@/types/chat';
import { useState } from "react";

interface SidePanelProps {
  windows: ChatWindow[];
  onToggleWindow: (id: string) => void;
  isOpen: boolean;
  onTogglePanel: () => void;
  attachments: Attachment[];
  onViewAttachment: (attachment: Attachment) => void;
  onDeleteAttachment: (attachmentId: string) => void;
  onRequestWebSearch?: () => void;
}

const SidePanel: React.FC<SidePanelProps> = ({ 
  windows, 
  onToggleWindow, 
  isOpen, 
  onTogglePanel,
  attachments,
  onViewAttachment,
  onDeleteAttachment,
  onRequestWebSearch
}) => {
  const [activeTab, setActiveTab] = useState<'windows' | 'attachments'>('windows');

  return (
    <div
      className={`
          fixed left-0 top-0 h-full bg-white dark:bg-gray-800 shadow-lg
          transition-all duration-300 z-10
          ${isOpen ? 'w-64' : 'w-12'}
      `}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 z-20 pointer-events-auto"
        onClick={onTogglePanel}
        aria-label={isOpen ? "Close panel" : "Open panel"}
      >
        {isOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
      </Button>
      
      {isOpen && (
        <>
          <div className="flex border-b border-gray-200 dark:border-gray-700 pt-14">
            <button
              className={`flex-1 py-2 px-4 text-sm font-medium ${
                activeTab === 'windows' 
                ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
              onClick={() => setActiveTab('windows')}
            >
              Windows
            </button>
            <button
              className={`flex-1 py-2 px-4 text-sm font-medium relative ${
                activeTab === 'attachments' 
                ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
              onClick={() => setActiveTab('attachments')}
            >
              Attachments
              {attachments.length > 0 && (
                <span className="absolute top-1 right-1 inline-flex items-center justify-center w-4 h-4 text-xs font-bold text-white bg-blue-500 rounded-full">
                  {attachments.length}
                </span>
              )}
            </button>
          </div>

          <ScrollArea className="h-[calc(100%-7.5rem)] px-4">
            {activeTab === 'windows' ? (
              <div className="space-y-4 py-4">
                <h3 className="font-semibold text-lg dark:text-white">Chat Windows</h3>
                {windows.map((window) => (
                  <div key={window.id} className="flex items-center justify-between">
                    <span className="dark:text-white">{window.title}</span>
                    <Switch
                      checked={window.isVisible}
                      onCheckedChange={() => {
                        onToggleWindow(window.id);
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4 py-4">
                <h3 className="font-semibold text-lg dark:text-white">Attachments</h3>
                {attachments.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No attachments</p>
                ) : (
                  <div className="space-y-2">
                    {attachments.map((attachment) => (
                      <div 
                        key={`attachment-${attachment.id}`} 
                        className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg relative border border-gray-200 dark:border-gray-600"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-1 rounded ${
                              attachment.type === 'code' ? 'bg-blue-500' : 
                              attachment.type === 'file' ? 'bg-green-500' : 'bg-gray-500'
                            } text-white`}>
                              {attachment.type.toUpperCase()}
                            </span>
                            <p className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[120px]">
                              {attachment.preview}
                            </p>
                          </div>
                          <div className="flex space-x-1">
                            <button
                              onClick={() => onViewAttachment(attachment)}
                              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                              aria-label="View attachment"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => onDeleteAttachment(attachment.id)}
                              className="text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400"
                              aria-label="Delete attachment"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
          
          <div className="absolute bottom-0 left-0 w-full px-4 py-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
            {onRequestWebSearch && (
              <Button 
                variant="outline" 
                className="w-full flex items-center justify-center gap-2 py-2"
                onClick={onRequestWebSearch}
              >
                <Search size={16} />
                <span>Search Web</span>
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SidePanel;