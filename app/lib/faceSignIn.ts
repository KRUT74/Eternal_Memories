"use client"

import { useEffect, useState } from "react"
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser"

// Face sign-in uses passkeys: the device checks the face (or fingerprint, or PIN)
// and the server only ever sees a signature, never the face.

export interface Passkey {
  id: string
  device_label: string
  created_at: string
  last_used_at: string | null
}

export type FaceResult = { ok: true } | { ok: false; error: string }

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

/** The browser's own errors, in plain words. */
function deviceError(err: unknown, action: "sign in" | "set up"): string {
  const name = err instanceof Error ? err.name : ""
  if (name === "NotAllowedError" || name === "AbortError") {
    return action === "sign in"
      ? "Face sign-in was cancelled or timed out. Try again, or use your email."
      : "Setting up face sign-in was cancelled. You can try again any time."
  }
  if (name === "InvalidStateError") return "Face sign-in is already set up on this device."
  return action === "sign in" ? "Face sign-in didn't work on this device. Please use your email." : "This device couldn't set up face sign-in."
}

export async function signInWithFace(): Promise<FaceResult> {
  const options = await postJson("/api/auth/passkey/login/options")
  if (!options.ok) return { ok: false, error: options.data.error || "Face sign-in isn't available right now." }
  let response
  try {
    response = await startAuthentication({ optionsJSON: options.data })
  } catch (err) {
    return { ok: false, error: deviceError(err, "sign in") }
  }
  const verified = await postJson("/api/auth/passkey/login/verify", response)
  return verified.ok ? { ok: true } : { ok: false, error: verified.data.error || "Face sign-in didn't work. Please try again." }
}

export async function setUpFaceSignIn(): Promise<{ ok: true; passkey: Passkey } | { ok: false; error: string }> {
  const options = await postJson("/api/auth/passkey/register/options")
  if (!options.ok) return { ok: false, error: options.data.error || "Face sign-in can't be set up right now." }
  let response
  try {
    response = await startRegistration({ optionsJSON: options.data })
  } catch (err) {
    return { ok: false, error: deviceError(err, "set up") }
  }
  const verified = await postJson("/api/auth/passkey/register/verify", response)
  return verified.ok
    ? { ok: true, passkey: verified.data.passkey }
    : { ok: false, error: verified.data.error || "Face sign-in couldn't be set up. Please try again." }
}

/**
 * What this browser can do, checked after mounting (the server can't know):
 * "signIn" when it supports passkeys at all (a phone nearby can also be used),
 * "setUp" when this device itself can unlock one with face, fingerprint or PIN.
 */
export function useFaceSupport() {
  const [support, setSupport] = useState({ signIn: false, setUp: false })
  useEffect(() => {
    if (!browserSupportsWebAuthn()) return
    let cancelled = false
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .catch(() => false)
      .then((platform) => {
        if (!cancelled) setSupport({ signIn: true, setUp: platform })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return support
}
