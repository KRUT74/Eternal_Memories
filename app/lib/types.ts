export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}

export interface User {
  id: string
  name: string
  email: string
}
