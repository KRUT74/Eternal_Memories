import { getSession, ipHash, unauthorized } from "@/lib/server/session"
import { lastTidy, runTidy } from "@/lib/server/tidy"
import { checkSpendAllowed, limitResponse } from "@/lib/server/usage"

export const maxDuration = 60

const MIN_MINUTES_BETWEEN = 10

/** "Tidy up now", from the memory panel. Tidy-ups also run on their own after replies. */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return unauthorized()
  const ip = ipHash(req)

  const previous = await lastTidy(session.userId)
  if (previous && Date.now() - new Date(previous.created_at).getTime() < MIN_MINUTES_BETWEEN * 60_000) {
    return Response.json({ error: "Your memories were just tidied. Try again in a few minutes." }, { status: 429 })
  }
  const check = await checkSpendAllowed(session.userId, ip)
  if (!check.ok) return limitResponse(check)

  try {
    return Response.json({ run: await runTidy(session.userId, ip) })
  } catch (error) {
    console.error("Tidy-up failed", error)
    return Response.json({ error: "Couldn't tidy your memories just now. Please try again later." }, { status: 500 })
  }
}
