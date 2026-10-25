"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CommitStrategy, RealtimeEvents, Scribe, type RealtimeConnection } from "@elevenlabs/client"
import { LimitReachedError, SpeechQueue } from "./speechQueue"
import type { SendOptions } from "../useChat"

export type VoiceStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking"

interface VoiceOptions {
  send: (text: string, options: SendOptions) => Promise<string | null>
}

// How long a pause ends your turn. Long enough for a breath mid-sentence.
const END_OF_TURN_SILENCE_SECS = 1.0
// Words heard while the companion is talking before it stops to listen (barge-in).
const BARGE_IN_WORDS = 2
// Voice mode switches itself off after this long with nothing said.
const IDLE_TIMEOUT_MS = 60_000

// If nothing at all has been heard this long after listening starts, suggest checking the mic.
const NOTHING_HEARD_HINT_MS = 8_000

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

const CHECK_INPUT =
  "check which microphone your browser is using (site settings → Microphone) and that it isn't muted"

/** Turns a getUserMedia failure into a message that says what to do about it. */
function microphoneErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ""
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "Microphone access is blocked for this site. Click the icon to the left of the address bar, set Microphone to Allow, and try again. On a Mac, also allow your browser under System Settings → Privacy & Security → Microphone."
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "No microphone was found. Connect one or check your computer's sound input settings, then try again."
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "Your microphone couldn't start. It may be in use by another app such as Zoom or Teams. Close it and try again."
    default:
      return "Couldn't start the microphone. You can keep typing instead."
  }
}

/**
 * Hands-free voice conversation: ElevenLabs Scribe listens and decides when you've
 * finished speaking, the text goes through the normal chat pipeline, and the reply
 * is spoken back sentence by sentence. Talking over the reply interrupts it.
 */
export function useVoiceConversation({ send }: VoiceOptions) {
  const [status, setStatusState] = useState<VoiceStatus>("idle")
  const [partial, setPartial] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const statusRef = useRef<VoiceStatus>("idle")
  const connectionRef = useRef<RealtimeConnection | null>(null)
  const queueRef = useRef<SpeechQueue | null>(null)
  const turnRef = useRef(0)
  const tokenExpiresAtRef = useRef(0)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heardAnythingRef = useRef(false)
  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  })

  const setStatus = (next: VoiceStatus) => {
    statusRef.current = next
    setStatusState(next)
  }

  const clearIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = null
  }

  const clearHint = () => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    hintTimerRef.current = null
    setHint(null)
  }

  const stop = useCallback((reason?: string) => {
    turnRef.current++
    clearIdleTimer()
    clearHint()
    const connection = connectionRef.current
    connectionRef.current = null
    connection?.close()
    queueRef.current?.stop()
    setPartial("")
    setStatus("idle")
    if (reason) setError(reason)
  }, [])

  const armIdleTimer = useCallback(() => {
    clearIdleTimer()
    idleTimerRef.current = setTimeout(() => {
      if (statusRef.current !== "listening") return
      stop(
        heardAnythingRef.current
          ? "Voice mode ended after a minute of quiet."
          : `Voice mode ended because I couldn't hear anything. Please ${CHECK_INPUT}.`,
      )
    }, IDLE_TIMEOUT_MS)
  }, [stop])

  // Defined below; referenced by listen() for token renewal.
  const connectRef = useRef<() => Promise<boolean>>(async () => false)

  const listen = useCallback(() => {
    setPartial("")
    setStatus("listening")
    armIdleTimer()
    // Listening tokens are paid for in blocks; reconnect between turns when one runs out.
    if (Date.now() > tokenExpiresAtRef.current) void connectRef.current()
  }, [armIdleTimer])

  const handleUtterance = useCallback(
    async (text: string) => {
      if (statusRef.current === "thinking" || statusRef.current === "idle") return
      queueRef.current?.stop()
      const turn = ++turnRef.current
      clearIdleTimer()
      setPartial(text)
      setStatus("thinking")

      const reply = await sendRef.current(text, {
        mode: "voice",
        onTextDelta: (delta) => {
          if (turn === turnRef.current) queueRef.current?.push(delta)
        },
      })
      if (turn !== turnRef.current) return
      if (reply === null) {
        // The chat shows the error; keep listening so the user can try again.
        listen()
        return
      }
      queueRef.current?.flush()
    },
    [listen],
  )

  const connect = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/voice/token", { cache: "no-store" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      stop(data.error || "Voice is unavailable right now. You can keep typing.")
      return false
    }
    if (statusRef.current === "idle") return false

    connectionRef.current?.close()
    const connection = Scribe.connect({
      token: data.token,
      modelId: data.modelId,
      commitStrategy: CommitStrategy.VAD,
      vadSilenceThresholdSecs: END_OF_TURN_SILENCE_SECS,
      microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    connectionRef.current = connection
    tokenExpiresAtRef.current = Date.now() + data.validForSeconds * 1000

    connection.on(RealtimeEvents.SESSION_STARTED, () => {
      if (statusRef.current === "connecting") listen()
    })
    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (message) => {
      if (connectionRef.current !== connection) return
      const text = message.text ?? ""
      if (text.trim() && !heardAnythingRef.current) {
        heardAnythingRef.current = true
        clearHint()
      }
      if (statusRef.current === "speaking" && wordCount(text) >= BARGE_IN_WORDS) {
        // The user is talking over the reply: stop speaking and listen.
        turnRef.current++
        queueRef.current?.stop()
        setStatus("listening")
      }
      if (statusRef.current === "listening") {
        setPartial(text)
        armIdleTimer()
      }
    })
    connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (message) => {
      if (connectionRef.current !== connection) return
      const text = (message.text ?? "").trim()
      if (text && statusRef.current === "listening") void handleUtterance(text)
    })
    connection.on(RealtimeEvents.AUTH_ERROR, () => stop("Voice session expired. Tap the microphone to start again."))
    connection.on(RealtimeEvents.QUOTA_EXCEEDED, () => stop("Voice is unavailable right now. You can keep typing."))
    connection.on(RealtimeEvents.ERROR, (message) => {
      console.error("Voice error", message)
      if (connectionRef.current === connection) stop("Voice connection had a problem. Tap the microphone to try again.")
    })
    connection.on(RealtimeEvents.CLOSE, () => {
      if (connectionRef.current === connection && statusRef.current !== "idle") {
        stop("Voice connection closed. Tap the microphone to start again.")
      }
    })
    return true
  }, [handleUtterance, listen, armIdleTimer, stop])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  /** Call from a click: asks for the microphone, unlocks audio, and starts listening. */
  const start = useCallback(async () => {
    if (statusRef.current !== "idle") return
    setError(null)

    if (!window.isSecureContext) {
      setError("Voice needs a secure connection. Open this page over https, or at localhost when running it locally.")
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof WebSocket === "undefined" || typeof AudioWorkletNode === "undefined") {
      setError("This browser doesn't support voice conversations. Try a recent Chrome, Edge, Safari or Firefox.")
      return
    }

    setStatus("connecting")
    heardAnythingRef.current = false
    clearHint()
    hintTimerRef.current = setTimeout(() => {
      if (!heardAnythingRef.current && statusRef.current === "listening") {
        setHint(`I can't hear anything yet. Please ${CHECK_INPUT}.`)
      }
    }, NOTHING_HEARD_HINT_MS)

    queueRef.current ??= new SpeechQueue({
      onSpeakingStart: () => {
        if (statusRef.current === "thinking") {
          setPartial("")
          setStatus("speaking")
        }
      },
      onIdle: () => {
        if (statusRef.current === "speaking" || statusRef.current === "thinking") listen()
      },
      onError: (err) => {
        if (err instanceof LimitReachedError) stop(err.message)
        else {
          setError(err.message)
          listen()
        }
      },
    })
    queueRef.current.unlock()

    // Ask for the microphone ourselves first, so a refusal gets a clear message.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
    } catch (err) {
      stop(microphoneErrorMessage(err))
      return
    }
    if (statusRef.current === "idle") return

    try {
      await connect()
    } catch (err) {
      console.error("Voice connect failed", err)
      stop("Couldn't start voice. You can keep typing.")
    }
  }, [connect, listen, stop])

  // End voice mode with Esc, or when the tab is hidden.
  useEffect(() => {
    if (status === "idle") return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stop()
    const onVisibility = () => document.hidden && stop()
    window.addEventListener("keydown", onKey)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("keydown", onKey)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [status, stop])

  // Release the microphone if the component goes away mid-conversation.
  useEffect(() => () => stop(), [stop])

  return { status, partial, hint, error, clearError: () => setError(null), start, stop }
}
