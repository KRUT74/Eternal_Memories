import Home from "./components/Home"
import { getSession } from "@/lib/server/session"

// Reads the session cookie, so new visitors (and crawlers) get the welcome
// screen in the server-rendered HTML instead of a loading state.
export default async function Page() {
  const session = await getSession()
  return <Home initialName={session?.name ?? null} />
}
