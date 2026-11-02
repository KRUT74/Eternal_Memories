"use client"

import { useState } from "react"
import { Button } from "./ui/button"
import { LogOut, Mail, ScanFace, Trash2, User as UserIcon, X } from "lucide-react"
import type { AppSession } from "./Home"
import type { Passkey } from "../lib/faceSignIn"

interface UserProfileProps {
  session: AppSession
  canUpgrade: boolean
  onUpgrade: () => void
  onSignedOut: () => void
  /** Face sign-in controls, for email accounts when the feature is on. */
  faceSignIn?: {
    passkeys: Passkey[]
    /** This device can unlock a passkey with face, fingerprint or PIN. */
    canSetUp: boolean
    onSetUp: () => Promise<{ ok: true } | { ok: false; error: string }>
    onRemove: (id: string) => Promise<boolean>
  }
}

export default function UserProfile({ session, canUpgrade, onUpgrade, onSignedOut, faceSignIn }: UserProfileProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const guest = session.kind === "guest"

  const signOut = async () => {
    if (
      guest &&
      !window.confirm(
        "You're a guest, so signing out means you can't get back to these memories. Sign out anyway?",
      )
    ) {
      return
    }
    await fetch("/api/session", { method: "DELETE" })
    onSignedOut()
  }

  const forgetEverything = async () => {
    if (!window.confirm("Delete all your messages and memories and start over? This can't be undone.")) return
    const res = await fetch("/api/account", { method: "DELETE" })
    if (res.ok || res.status === 401) {
      onSignedOut()
    } else {
      setError("Could not delete your data. Please try again.")
    }
  }

  const setUpFace = async () => {
    if (!faceSignIn) return
    setError(null)
    const result = await faceSignIn.onSetUp()
    if (!result.ok) setError(result.error)
  }

  const removeFace = async (passkey: Passkey) => {
    if (!faceSignIn) return
    if (!window.confirm(`Turn off face sign-in on ${passkey.device_label}? You can still sign in with your email.`)) return
    setError(null)
    if (!(await faceSignIn.onRemove(passkey.id))) setError("Couldn't turn off face sign-in. Please try again.")
  }

  const itemClass = "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-raised"

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowDropdown(!showDropdown)}
        aria-expanded={showDropdown}
        aria-haspopup="menu"
        aria-label={`Account menu for ${session.name}`}
        className="flex items-center gap-2 bg-transparent font-mono text-xs"
      >
        <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">{session.name.toLowerCase()}</span>
      </Button>

      {showDropdown && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-line bg-surface shadow-2xl shadow-black/40"
        >
          <div className="border-b border-line p-4">
            <p className="font-medium">{session.name}</p>
            <p className="mt-1 text-xs text-muted">
              {guest ? "Guest · memories are kept in this browser only" : `Signed in as ${session.email ?? "email account"}`}
            </p>
          </div>
          <div className="p-2">
            {canUpgrade && (
              <button
                role="menuitem"
                onClick={() => {
                  setShowDropdown(false)
                  onUpgrade()
                }}
                className={`${itemClass} text-star`}
              >
                <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                Save your memories with email
              </button>
            )}
            {faceSignIn?.passkeys.map((passkey) => (
              <div key={passkey.id} className="flex items-center rounded-lg px-3 py-2 text-sm">
                <ScanFace className="mr-2 h-4 w-4 text-teal" aria-hidden="true" />
                <span className="flex-1">Face sign-in on {passkey.device_label}</span>
                <button
                  role="menuitem"
                  onClick={() => void removeFace(passkey)}
                  aria-label={`Turn off face sign-in on ${passkey.device_label}`}
                  className="rounded p-1 text-muted hover:bg-surface-raised hover:text-text"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
            {/* Always offered: another device having it doesn't mean this one does. */}
            {faceSignIn?.canSetUp && (
              <button role="menuitem" onClick={() => void setUpFace()} className={`${itemClass} text-star`}>
                <ScanFace className="mr-2 h-4 w-4" aria-hidden="true" />
                {faceSignIn.passkeys.length === 0 ? "Set up face sign-in" : "Set up face sign-in on this device"}
              </button>
            )}
            <button role="menuitem" onClick={signOut} className={itemClass}>
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
            <button role="menuitem" onClick={forgetEverything} className={`${itemClass} text-danger hover:bg-danger/10`}>
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Forget everything and start over
            </button>
            {error && (
              <p className="px-3 pb-2 text-xs text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
