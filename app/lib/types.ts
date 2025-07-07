export interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string | MessageContent[]
  createdAt?: Date
}

export interface MessageContent {
  type: string
  text?: string
  [key: string]: any
}

export interface WebhookStatus {
  status: "pending" | "processing" | "completed" | "failed"
  message: string
}

export interface WebhookPayload {
  sessionId: string
  message: string
  allMessages: Message[]
  timestamp: string
  source: "chat-app"
  requestId: string
}

export interface WebhookResponse {
  success: boolean
  message?: string
  error?: string
  response?: string
}
