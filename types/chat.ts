export type ChatStatus = "ACTIVE" | "CLOSED" | "IDLE";

export type MessageSender = "USER" | "ADMIN";

export interface Message {
  id: string;
  content: string;
  sender: MessageSender;
  isBot: boolean;
  createdAt: string;
  userId: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export interface Chat {
  id: string;
  status: ChatStatus;
  userId: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  lastMessage?: string | null;
}

export interface SocketMessagePayload {
  chatId: string;
  message: Message;
}

