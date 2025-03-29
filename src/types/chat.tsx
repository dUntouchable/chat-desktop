export interface Attachment {
  id: string;
  content: string;
  preview: string;
  type: 'text' | 'code' | 'file';
  size: number;
}

export interface ChatMessage {
  text: string;
  sender: 'user' | 'bot';
  attachment?: Attachment;
}
  
export interface ChatWindow {
  id: string;
  title: string;
  messages: ChatMessage[];
  isVisible: boolean;
  attachments?: Attachment[];
}  