import { deleteAllUserData } from "@/lib/server/memory"
import { endSession, getSession, unauthorized } from "@/lib/server/session"

/** "Forget everything": deletes messages, memories and (for email accounts) the account, then signs out. */
export async function DELETE() {
  const session = await getSession()
  if (!session) return unauthorized()
  await deleteAllUserData(session.userId)
  await endSession()
  return new Response(null, { status: 204 })
}
