import { Brain, Mic, ShieldCheck } from "lucide-react"

const STEPS = [
  {
    icon: Mic,
    title: "Talk or type",
    body: "Have a hands-free voice conversation, or type. Speak over a reply to interrupt, like a real conversation.",
  },
  {
    icon: Brain,
    title: "It remembers what matters",
    body: "After each exchange, lasting facts become stars in your constellation and are recalled when they're relevant.",
  },
  {
    icon: ShieldCheck,
    title: "You stay in control",
    body: "See every memory, forget any of them with one click, or erase everything. Nothing is shared between visitors.",
  },
]

export default function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works" className="mx-auto mt-12 max-w-4xl pb-6">
      <h2 id="how-it-works" className="mb-5 text-center font-mono text-xs tracking-[0.2em] text-muted">
        HOW IT WORKS
      </h2>
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="rounded-2xl border border-line p-5">
            <Icon className="mb-3 h-5 w-5 text-star" aria-hidden="true" />
            <h3 className="font-serif text-xl">{title}</h3>
            <p className="mt-1.5 text-sm text-muted">{body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-center font-mono text-[11px] text-muted">
        built with claude · supabase pgvector · elevenlabs voice · next.js
      </p>
    </section>
  )
}
