import Landing from "./components/Landing"
import { env } from "@/lib/server/env"
import { getSession } from "@/lib/server/session"

// Landing page with sign-in. Server-rendered so visitors and crawlers see it
// straight away; a returning visitor gets a "Continue" button instead of the form.
export default async function Page() {
  const session = await getSession()
  return <Landing signedInAs={session?.name ?? null} emailSignInEnabled={env.emailSignInEnabled} />
}
