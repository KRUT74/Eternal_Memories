// Turns a streamed reply into speech: text is cut into sentences as it arrives,
// each sentence is synthesised by /api/voice/speak as soon as it is complete, and
// the audio plays back in order. Speaking can start before the reply has finished.

// A sentence ends at . ! ? or … followed by optional closing quotes/brackets and whitespace.
const SENTENCE_END = /[.!?…]+["')\]]*\s+/g
// Very short sentences ("Oh no.") are merged with the next so we make fewer requests.
const MIN_CHUNK = 40

// A tiny silent WAV, played inside the user's click to unlock audio in Safari.
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="

export class LimitReachedError extends Error {}

export class SpeechQueue {
  private buffer = ""
  private pending: Promise<Blob | null>[] = []
  private playing = false
  private controller = new AbortController()
  private audio: HTMLAudioElement | null = null
  private finishPlayback: (() => void) | null = null
  // True once the whole reply has arrived; only then can the queue go idle.
  private replyComplete = false

  constructor(
    private readonly events: {
      onSpeakingStart: () => void
      onIdle: () => void
      onError: (error: Error) => void
    },
  ) {}

  /** Must be called from a click/tap handler so later playback is allowed. */
  unlock() {
    this.audio ??= new Audio()
    this.audio.src = SILENCE
    void this.audio.play().catch(() => {})
  }

  /** Adds streamed reply text; complete sentences are sent for synthesis right away. */
  push(text: string) {
    this.replyComplete = false
    this.buffer += text
    let lastEnd = 0
    for (const match of this.buffer.matchAll(SENTENCE_END)) {
      const end = match.index + match[0].length
      if (end - lastEnd >= MIN_CHUNK) {
        this.enqueue(this.buffer.slice(lastEnd, end))
        lastEnd = end
      }
    }
    this.buffer = this.buffer.slice(lastEnd)
  }

  /** The reply has finished streaming: speak whatever is left. */
  flush() {
    this.replyComplete = true
    if (this.buffer.trim()) this.enqueue(this.buffer)
    this.buffer = ""
    if (!this.playing && this.pending.length === 0) this.events.onIdle()
  }

  /** Stops speaking immediately and discards everything queued (barge-in, end). */
  stop() {
    this.controller.abort()
    this.controller = new AbortController()
    this.pending = []
    this.buffer = ""
    this.replyComplete = false
    this.audio?.pause()
    this.finishPlayback?.()
    this.playing = false
  }

  private enqueue(text: string) {
    const signal = this.controller.signal
    const request = fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim().slice(0, 600) }),
      signal,
    }).then(async (res) => {
      if (res.status === 204) return null
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}))
        throw new LimitReachedError(data.error || "Voice limit reached for today.")
      }
      if (!res.ok) throw new Error("Couldn't play the spoken reply.")
      return res.blob()
    })
    // Avoid unhandled rejections for requests aborted by stop().
    request.catch(() => {})
    this.pending.push(request)
    void this.pump(signal)
  }

  private async pump(signal: AbortSignal) {
    if (this.playing) return
    this.playing = true
    try {
      while (this.pending.length > 0 && !signal.aborted) {
        const blob = await this.pending.shift()!
        if (!blob || signal.aborted) continue
        await this.play(blob, signal)
      }
    } catch (error) {
      if (!signal.aborted) {
        this.stop()
        this.events.onError(error instanceof Error ? error : new Error(String(error)))
        return
      }
    }
    if (signal.aborted) return
    this.playing = false
    if (this.replyComplete && this.pending.length === 0) this.events.onIdle()
  }

  private play(blob: Blob, signal: AbortSignal): Promise<void> {
    const audio = (this.audio ??= new Audio())
    const url = URL.createObjectURL(blob)
    return new Promise<void>((resolve) => {
      const done = () => {
        URL.revokeObjectURL(url)
        audio.onended = audio.onerror = null
        this.finishPlayback = null
        resolve()
      }
      this.finishPlayback = done
      audio.onended = done
      audio.onerror = done
      audio.src = url
      if (signal.aborted) return done()
      this.events.onSpeakingStart()
      audio.play().catch(done)
    })
  }
}
