import { NextResponse } from "next/server"

// The n8n + Zep backend was removed. Phase 2 replaces this route with
// Claude + Supabase/pgvector memory.
export async function POST() {
  return NextResponse.json(
    { error: "Chat is offline while the memory backend is being rebuilt." },
    { status: 503 },
  )
}
