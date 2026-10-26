import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Eternal Memories stores, why, who processes it, and how to delete it.",
  alternates: { canonical: "/privacy" },
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/" className="font-serif text-2xl">
        Eternal <i className="text-star">Memories</i>
      </Link>
      <h1 className="mt-10 font-serif text-4xl">Privacy</h1>
      <p className="mt-3 text-muted">
        Eternal Memories is a portfolio demo. It keeps only what it needs to remember you, and you can delete all of
        it at any time.
      </p>

      <div className="mt-8 space-y-7 leading-relaxed [&_h2]:font-serif [&_h2]:text-2xl [&_p]:mt-2 [&_p]:text-text/90 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        <section>
          <h2>What is stored</h2>
          <ul>
            <li>The name you give, and your email address if you sign in with email.</li>
            <li>Your conversation messages.</li>
            <li>The short facts it remembers about you (your “stars”).</li>
            <li>Usage records (time, estimated cost, and a one-way hash of your network address) to keep the demo within its limits.</li>
          </ul>
          <p>Voice audio is transcribed as you speak and is not stored by this app.</p>
        </section>

        <section>
          <h2>Who processes it</h2>
          <ul>
            <li><strong>Supabase</strong> stores the data above.</li>
            <li><strong>Anthropic</strong> (Claude) writes the replies and picks out what to remember.</li>
            <li><strong>ElevenLabs</strong> turns speech into text and replies into speech, in voice mode.</li>
            <li><strong>Resend</strong> delivers sign-in codes by email.</li>
            <li><strong>Vercel</strong> hosts the app.</li>
          </ul>
        </section>

        <section>
          <h2>Your choices</h2>
          <ul>
            <li>Remove any single memory with the ✕ next to it.</li>
            <li>
              <strong>Forget everything</strong> (in the account menu) permanently deletes your messages, memories and,
              for email accounts, the account itself.
            </li>
            <li>Guests aren&apos;t asked for an email; their memories are reachable only from the browser they used.</li>
          </ul>
        </section>

        <section>
          <h2>Cookies</h2>
          <p>
            One essential cookie keeps you signed in. It holds a signed ID, not your data. There are no analytics or
            advertising cookies.
          </p>
        </section>
      </div>

      <p className="mt-12 font-mono text-[11px] text-muted">
        <Link href="/" className="hover:text-text">
          ← back to eternal memories
        </Link>
      </p>
    </div>
  )
}
