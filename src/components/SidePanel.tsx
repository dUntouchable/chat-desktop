import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Switch } from "./ui/switch";
import { ChatWindow } from '@/types/chat';

const SidePanel: React.FC<{
  windows: ChatWindow[];
  onToggleWindow: (id: string) => void;
  isOpen: boolean;
  onTogglePanel: () => void;
}> = ({ windows, onToggleWindow, isOpen, onTogglePanel }) => {

    console.log('SidePanel rendered, isOpen:', isOpen);

    const handlePanelToggle = () => {
        console.log('Toggle button clicked');
        console.log('Current panel state before toggle:', isOpen);
        onTogglePanel();
        console.log('Panel toggle function called');
    };
  
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
            onClick={handlePanelToggle}
            aria-label={isOpen ? "Close panel" : "Open panel"}
        >
            {isOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
        
        {isOpen && (
            <ScrollArea className="h-full pt-14 px-4">
            <div className="space-y-4">
                <h3 className="font-semibold text-lg dark:text-white">Chat Windows</h3>
                {windows.map((window) => (
                <div key={window.id} className="flex items-center justify-between">
                    <span className="dark:text-white">{window.title}</span>
                    <Switch
                    checked={window.isVisible}
                    onCheckedChange={() => {
                        console.log('Toggling window:', window.id);
                        onToggleWindow(window.id);
                      }}
                    />
                </div>
                ))}
            </div>
            </ScrollArea>
        )}
        </div>
    );
};

export default SidePanel;