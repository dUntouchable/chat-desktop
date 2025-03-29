import { ChatWindowId } from '@/app/api/chat/route';

// Model to window mapping that can be shared across components
export const MODEL_TO_WINDOW_MAP: Record<string, ChatWindowId> = {
  'response1': 'llama',
  'response2': 'anthropic',
  'response3': 'openai'
};

// Helper function to get window ID from model key
export function getWindowId(modelKey: string): ChatWindowId | undefined {
  return MODEL_TO_WINDOW_MAP[modelKey];
} 