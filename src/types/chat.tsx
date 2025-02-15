export interface ChatMessage {
    text: string;
    sender: 'user' | 'bot';
  }
  
  export interface ChatWindow {
    id: string;
    title: string;
    messages: ChatMessage[];
    isVisible: boolean;
  }  