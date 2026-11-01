"use client"

import { useState } from "react"
import { ScanFace } from "lucide-react"
import { Button } from "./ui/button"
import type { Passkey } from "../lib/faceSignIn"

interface FaceSetupPromptProps {
  onSetUp: () => Promise<{ ok: true; passkey: Passkey } | { ok: false; error: string }>
  onDismiss: () => void
}

/** Offered once to email accounts: sign in next time by face instead of an emailed code. */
export default function FaceSetupPrompt({ onSetUp, onDismiss }: FaceSetupPromptProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneOn, setDoneOn] = useState<string | null>(null)

  const setUp = async () => {
    setError(null)
    setBusy(true)
    const result = await onSetUp()
    setBusy(false)
    if (result.ok) setDoneOn(result.passkey.device_label)
    else setError(result.error)
  }

  return (
    <section
      aria-labelledby="face-setup-title"
      className="mb-5 flex flex-col gap-4 rounded-3xl border border-star/30 bg-surface/90 p-5 sm:flex-row sm:items-center"
    >
      <ScanFace className="h-9 w-9 shrink-0 text-star" aria-hidden="true" />
      <div className="flex-1">
        <h2 id="face-setup-title" className="font-serif text-xl">
          {doneOn ? "Face sign-in is on" : "Next time, sign in with just your face"}
        </h2>
        <p className="mt-1 text-sm text-muted" role={doneOn ? "status" : undefined}>
          {doneOn
            ? `On this ${doneOn === "this device" ? "device" : doneOn}, tap "Sign in with your face" instead of waiting for an email.`
            : "No email or code to remember. Uses Face ID, fingerprint or your device PIN; your face never leaves your device."}
        </p>
        {error && (
          <p className="mt-2 text-sm text-[#fbd0d0]" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex gap-2 sm:flex-col">
        {doneOn ? (
          <Button type="button" onClick={onDismiss} className="h-11 flex-1 px-5">
            Done
          </Button>
        ) : (
          <>
            <Button type="button" onClick={setUp} disabled={busy} className="h-11 flex-1 px-5">
              {busy ? "Look at your device…" : "Set up face sign-in"}
            </Button>
            <Button type="button" variant="outline" onClick={onDismiss} disabled={busy} className="h-11 flex-1 bg-transparent px-5">
              Not now
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
