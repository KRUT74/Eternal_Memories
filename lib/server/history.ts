import "server-only"
import { supabase } from "./supabase"

export interface StoredMessage {
  id: string
  role: "user" | "assistant"
  content: string
  created_at: string
}

export async function recentMessages(userId: string, limit: number): Promise<StoredMessage[]> {
  const { data, error } = await supabase()
    .from("messages")
    .select("id, role, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as StoredMessage[]).reverse()
}

export async function saveMessage(userId: string, role: "user" | "assistant", content: string): Promise<StoredMessage> {
  const { data, error } = await supabase()
    .from("messages")
    .insert({ user_id: userId, role, content })
    .select("id, role, content, created_at")
    .single()
  if (error) throw error
  return data as StoredMessage
}
