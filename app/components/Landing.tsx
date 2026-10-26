import Link from "next/link"
import { ArrowRight } from "lucide-react"
import HowItWorks from "./HowItWorks"
import SignInCard from "./SignInCard"

// A fixed decorative constellation for the hero: each star is a memory.
const STARS = [
  { x: 40, y: 150, r: 3.5, c: "var(--star)" },
  { x: 120, y: 70, r: 2.5, c: "#8a93b0" },
  { x: 205, y: 120, r: 4, c: "var(--star)" },
  { x: 260, y: 40, r: 3, c: "var(--teal)" },
  { x: 330, y: 105, r: 2.5, c: "#8a93b0" },
  { x: 300, y: 185, r: 3.5, c: "var(--star)" },
]

interface LandingProps {
  /** The visitor's session, if they already have one. */
  session: { name: string; kind: "guest" | "email" } | null
  emailSignInEnabled: boolean
}

export default function Landing({ session, emailSignInEnabled }: LandingProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <span className="font-serif text-[28px] leading-none sm:text-3xl">
          Eternal <i className="text-star">Memories</i>
        </span>
        <a
          href="https://github.com/KRUT74/Eternal_Memories"
          className="font-mono text-xs text-muted hover:text-text"
        >
          source on github
        </a>
      </header>

      <main className="flex-1">
        <section className="grid items-center gap-10 py-8 sm:py-14 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <h1 className="font-serif text-5xl leading-[1.02] text-balance sm:text-6xl">
              Every conversation <i className="text-star">leaves a star.</i>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Talk or type with an AI companion that remembers the people, plans and things you care about, and
              brings them up when they matter, days or weeks later.
            </p>
            <svg viewBox="0 0 370 220" className="mt-8 hidden w-full max-w-md sm:block" aria-hidden="true">
              {STARS.slice(1).map((s, i) => (
                <line key={i} x1={STARS[i].x} y1={STARS[i].y} x2={s.x} y2={s.y} stroke="#2e3b63" strokeWidth="1.2" />
              ))}
              {STARS.map((s, i) => (
                <g key={i}>
                  <circle cx={s.x} cy={s.y} r={s.r * 3} fill={s.c} opacity={0.16} />
                  <circle cx={s.x} cy={s.y} r={s.r} fill={s.c} />
                </g>
              ))}
            </svg>
          </div>

          <div className="mx-auto w-full max-w-md">
            {session ? (
              <div className="space-y-4">
                <div className="rounded-3xl border border-line bg-surface p-8">
                  <h2 className="font-serif text-3xl">Welcome back, {session.name}</h2>
                  <p className="mt-2 text-muted">
                    {session.kind === "guest"
                      ? "Your constellation is saved in this browser."
                      : "Your constellation is right where you left it."}
                  </p>
                  <Link
                    href="/app"
                    className="mt-6 flex h-11 items-center justify-center gap-2 rounded-md bg-star font-medium text-[#1a1405] hover:brightness-110"
                  >
                    Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
                {/* Guests can attach an email here, bringing this browser's memories with them. */}
                {session.kind === "guest" && emailSignInEnabled && (
                  <SignInCard mode="upgrade" emailSignInEnabled={emailSignInEnabled} />
                )}
              </div>
            ) : (
              <SignInCard mode="landing" emailSignInEnabled={emailSignInEnabled} />
            )}
          </div>
        </section>

        <HowItWorks />
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-5 font-mono text-[11px] text-muted">
        <span>built by benjapon kruthanooch</span>
        <nav className="flex gap-4" aria-label="Footer">
          <Link href="/privacy" className="hover:text-text">
            privacy
          </Link>
          <a href="https://github.com/KRUT74/Eternal_Memories" className="hover:text-text">
            github
          </a>
        </nav>
      </footer>
    </div>
  )
}
