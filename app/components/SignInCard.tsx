"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

interface SignInCardProps {
  /** "landing": email or guest. "upgrade": a guest adding an email to keep their memories. */
  mode: "landing" | "upgrade"
  emailSignInEnabled: boolean
  onSignedIn?: () => void
  onCancel?: () => void
}

const RESEND_SECONDS = 30

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

export default function SignInCard({ mode, emailSignInEnabled, onSignedIn, onCancel }: SignInCardProps) {
  const router = useRouter()
  const signedIn = () => (onSignedIn ? onSignedIn() : router.push("/app"))
  const [step, setStep] = useState<"start" | "code">("start")
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [guestName, setGuestName] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState<"email" | "code" | "guest" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  useEffect(() => {
    if (step === "code") codeRef.current?.focus()
  }, [step])

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError(null)
    setBusy("email")
    const { ok, data } = await postJson("/api/auth/request-code", { email })
    setBusy(null)
    if (!ok) return setError(data.error || "Couldn't send the code. Please try again.")
    setStep("code")
    setCode("")
    setNotice(`We sent a 6-digit code to ${email.trim()}. It works for 10 minutes.`)
    setResendIn(RESEND_SECONDS)
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy("code")
    const { ok, data } = await postJson("/api/auth/verify", {
      email,
      code,
      ...(name.trim() ? { name: name.trim() } : {}),
    })
    if (!ok) {
      setBusy(null)
      return setError(data.error || "That didn't work. Please try again.")
    }
    signedIn()
  }

  const startGuest = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy("guest")
    const { ok, data } = await postJson("/api/session", { name: guestName })
    if (!ok) {
      setBusy(null)
      return setError(data.error || "Couldn't start your session. Please try again.")
    }
    signedIn()
  }

  const title =
    mode === "upgrade" ? "Keep your memories on any device" : step === "code" ? "Check your email" : "Sign in to your constellation"

  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-2xl shadow-black/30 sm:p-8">
      <h2 id="sign-in-title" className="font-serif text-3xl leading-tight">
        {step === "code" ? "Check your email" : title}
      </h2>
      {mode === "upgrade" && step === "start" && (
        <p className="mt-2 text-sm text-muted">
          Add your email and everything I remember moves with you. Sign in on any device with a one-time code.
        </p>
      )}

      {notice && step === "code" && (
        <p className="mt-2 text-sm text-muted" role="status">
          {notice}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-sm text-[#fbd0d0]" role="alert">
          {error}
        </div>
      )}

      {step === "start" && emailSignInEnabled && (
        <form onSubmit={sendCode} className="mt-6 space-y-3">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11 bg-[#0e1426] placeholder:text-[#7a84a3]"
              required
            />
          </div>
          {mode === "landing" && (
            <div>
              <label htmlFor="account-name" className="mb-1.5 block text-sm font-medium">
                First name <span className="font-normal text-muted">(new accounts)</span>
              </label>
              <Input
                id="account-name"
                autoComplete="given-name"
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should I call you?"
                className="h-11 bg-[#0e1426] placeholder:text-[#7a84a3]"
              />
            </div>
          )}
          <Button type="submit" disabled={busy !== null || !email.trim()} className="h-11 w-full text-base">
            {busy === "email" ? "Sending…" : "Email me a sign-in code"}
          </Button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verify} className="mt-6 space-y-3">
          <div>
            <label htmlFor="code" className="mb-1.5 block text-sm font-medium">
              6-digit code
            </label>
            <Input
              ref={codeRef}
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="h-14 bg-[#0e1426] text-center font-mono text-2xl tracking-[0.5em] placeholder:text-[#3b4566]"
              required
            />
          </div>
          <Button type="submit" disabled={busy !== null || code.length !== 6} className="h-11 w-full text-base">
            {busy === "code" ? "Checking…" : "Sign in"}
          </Button>
          <div className="flex items-center justify-between pt-1 text-sm">
            <button
              type="button"
              onClick={() => {
                setStep("start")
                setError(null)
              }}
              className="flex items-center gap-1 text-muted hover:text-text"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Use a different email
            </button>
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={resendIn > 0 || busy !== null}
              className="text-star hover:underline disabled:text-muted disabled:no-underline"
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}

      {step === "start" && mode === "landing" && (
        <>
          {emailSignInEnabled && (
            <div className="my-6 flex items-center gap-3 font-mono text-[11px] text-muted" aria-hidden="true">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>
          )}
          <form onSubmit={startGuest} className={emailSignInEnabled ? "space-y-3" : "mt-6 space-y-3"}>
            <div>
              <label htmlFor="guest-name" className="mb-1.5 block text-sm font-medium">
                {emailSignInEnabled ? "Just try it, no email" : "What should I call you?"}
              </label>
              <Input
                id="guest-name"
                autoComplete="given-name"
                maxLength={40}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Your first name"
                className="h-11 bg-[#0e1426] placeholder:text-[#7a84a3]"
                required
              />
            </div>
            <Button
              type="submit"
              variant={emailSignInEnabled ? "outline" : "default"}
              disabled={busy !== null || !guestName.trim()}
              className={`h-11 w-full text-base ${emailSignInEnabled ? "bg-transparent" : ""}`}
            >
              {busy === "guest" ? "Opening your sky…" : emailSignInEnabled ? "Continue as a guest" : "Begin"}
            </Button>
          </form>
          <p className="mt-5 font-mono text-[11px] leading-relaxed text-muted">
            {emailSignInEnabled
              ? "guests: memories stay in this browser · email: on any device · forget anything, any time"
              : "no account needed · memories stay private to this browser · forget anything, any time"}
          </p>
        </>
      )}

      {mode === "upgrade" && onCancel && (
        <button type="button" onClick={onCancel} className="mt-4 w-full text-center text-sm text-muted hover:text-text">
          Not now
        </button>
      )}
    </div>
  )
}
