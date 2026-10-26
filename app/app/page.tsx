import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Home from "../components/Home"
import { env } from "@/lib/server/env"
import { getSession } from "@/lib/server/session"

export const metadata: Metadata = {
  title: "Your constellation",
  robots: { index: false },
}

/** The chat app. Visitors without a session go back to the landing page to sign in. */
export default async function AppPage() {
  const session = await getSession()
  if (!session) redirect("/")
  return (
    <Home
      session={{ name: session.name, kind: session.kind, email: session.email ?? null }}
      emailSignInEnabled={env.emailSignInEnabled}
    />
  )
}
