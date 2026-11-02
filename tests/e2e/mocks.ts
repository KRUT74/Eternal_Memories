import { createHmac } from "node:crypto"
import type { BrowserContext, Page } from "@playwright/test"

/** Must match SESSION_SECRET in playwright.config.ts's webServer env. */
export const TEST_SESSION_SECRET = "e2e-test-session-secret-not-for-production-0123456789"
const BASE_URL = "http://localhost:3200"

/** A session cookie signed the same way as lib/server/session.ts, so the server accepts it. */
export async function signInAs(context: BrowserContext, kind: "guest" | "email", name = "Sam") {
  const payload = Buffer.from(
    JSON.stringify({ u: kind === "email" ? "a_test" : "u_test", n: name, k: kind, e: kind === "email" ? "sa•••@example.com" : undefined }),
  ).toString("base64url")
  const signature = createHmac("sha256", TEST_SESSION_SECRET).update(payload).digest("base64url")
  await context.addCookies([{ name: "em_session", value: `${payload}.${signature}`, url: BASE_URL, httpOnly: true, sameSite: "Lax" }])
}

export interface MockMemory {
  id: string
  content: string
  created_at: string
  is_core?: boolean
  pinned?: boolean
}

export const MEMORIES: MockMemory[] = [
  { id: "11111111-1111-4111-8111-111111111111", content: "Their daughter Mia just started primary school.", created_at: "2026-10-20T10:00:00Z" },
  { id: "22222222-2222-4222-8222-222222222222", content: "They are training for a half marathon in March.", created_at: "2026-10-21T10:00:00Z" },
  { id: "33333333-3333-4333-8333-333333333333", content: "They live in Barcelona.", created_at: "2026-10-22T10:00:00Z" },
]
export const NEW_MEMORY: MockMemory = {
  id: "44444444-4444-4444-8444-444444444444",
  content: "Long runs are on Saturday mornings.",
  created_at: "2026-10-25T10:00:00Z",
}

const sse = (events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")

export const REPLY = "One skipped long run won't undo weeks of training for March. Could you move it to tomorrow?"

/**
 * Mocks the whole backend for a visitor who starts without a session.
 * Returns mutable state so tests can inspect what the app sent.
 */
export async function mockBackend(page: Page, options: { remainingToday?: number; chatStatus?: number } = {}) {
  const context = page.context()
  const state = {
    memories: [...MEMORIES],
    chatBodies: [] as Array<{ message: string; mode?: string }>,
    deleted: [] as string[],
    codeRequests: [] as string[],
    kind: "guest" as "guest" | "email",
    /** Face sign-in passkeys the mocked server knows about. */
    passkeys: [] as Array<{ id: string; device_label: string; created_at: string; last_used_at: string | null }>,
    faceSignIns: [] as string[],
    /** The last memory tidy-up, as GET /api/memories returns it. */
    lastTidy: null as null | { id: string; created_at: string; merged: number; updated: number; retired: number; core_changed: number; changes: object[] },
    pins: [] as Array<{ id: string; pinned: boolean }>,
    undos: [] as number[],
    tidyRequests: 0,
  }

  await page.route("**/api/session", async (route) => {
    const method = route.request().method()
    if (method === "POST") {
      await signInAs(context, "guest", route.request().postDataJSON().name)
      return route.fulfill({ status: 201, json: { name: route.request().postDataJSON().name } })
    }
    if (method === "DELETE") {
      await context.clearCookies()
      return route.fulfill({ status: 204 })
    }
    const cookies = await context.cookies(BASE_URL)
    return cookies.some((c) => c.name === "em_session")
      ? route.fulfill({ json: { name: "Sam", kind: state.kind, remainingToday: options.remainingToday ?? 40 } })
      : route.fulfill({ status: 401, json: { error: "No session" } })
  })

  await page.route("**/api/account", async (route) => {
    await context.clearCookies()
    return route.fulfill({ status: 204 })
  })

  // Email sign-in: any address gets a code; the code 123456 is correct.
  await page.route("**/api/auth/request-code", async (route) => {
    state.codeRequests.push(route.request().postDataJSON().email)
    return route.fulfill({ json: { sent: true, message: "If that address is valid, a code is on its way." } })
  })
  await page.route("**/api/auth/verify", async (route) => {
    const { code } = route.request().postDataJSON()
    if (code !== "123456") {
      return route.fulfill({ status: 400, json: { error: "That code isn't right. Check the email and try again.", reason: "invalid" } })
    }
    state.kind = "email"
    await signInAs(context, "email")
    return route.fulfill({ json: { name: "Sam", email: "sa•••@example.com", isNew: false } })
  })

  // Face sign-in: real WebAuthn in the browser (with a virtual authenticator, see
  // addVirtualAuthenticator), against a mocked server that skips signature checks.
  const challenge = () => Buffer.from(crypto.randomUUID()).toString("base64url")
  await page.route("**/api/auth/passkey", async (route) => {
    if (route.request().method() === "DELETE") {
      const { id } = route.request().postDataJSON()
      state.passkeys = state.passkeys.filter((p) => p.id !== id)
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ json: { enabled: true, passkeys: state.passkeys } })
  })
  await page.route("**/api/auth/passkey/register/options", (route) =>
    route.fulfill({
      json: {
        challenge: challenge(),
        rp: { name: "Eternal Memories", id: "localhost" },
        user: { id: Buffer.from("a_test").toString("base64url"), name: "sam@example.com", displayName: "Sam" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        timeout: 5000,
        attestation: "none",
        excludeCredentials: state.passkeys.map((p) => ({ id: p.id, type: "public-key" })),
        authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
      },
    }),
  )
  await page.route("**/api/auth/passkey/register/verify", async (route) => {
    const passkey = { id: route.request().postDataJSON().id, device_label: "Mac", created_at: new Date().toISOString(), last_used_at: null }
    state.passkeys.push(passkey)
    return route.fulfill({ json: { passkey } })
  })
  await page.route("**/api/auth/passkey/login/options", (route) =>
    route.fulfill({ json: { challenge: challenge(), rpId: "localhost", timeout: 5000, userVerification: "required" } }),
  )
  await page.route("**/api/auth/passkey/login/verify", async (route) => {
    const { id } = route.request().postDataJSON()
    state.faceSignIns.push(id)
    if (!state.passkeys.some((p) => p.id === id)) {
      return route.fulfill({
        status: 400,
        json: { error: "This face sign-in isn't linked to an account any more. Please sign in with your email.", reason: "unknown" },
      })
    }
    state.kind = "email"
    await signInAs(context, "email")
    return route.fulfill({ json: { name: "Sam", email: "sa•••@example.com" } })
  })

  await page.route("**/api/history", (route) => route.fulfill({ json: { messages: [] } }))
  await page.route("**/api/memories", (route) => route.fulfill({ json: { memories: state.memories, lastTidy: state.lastTidy } }))
  await page.route("**/api/memories/*", async (route) => {
    const id = route.request().url().split("/").pop()!
    if (id === "tidy") {
      state.tidyRequests++
      return route.fulfill({ json: { run: state.lastTidy } })
    }
    if (route.request().method() === "PATCH") {
      const { pinned } = route.request().postDataJSON()
      state.pins.push({ id, pinned })
      state.memories = state.memories.map((m) => (m.id === id ? { ...m, pinned } : m))
      return route.fulfill({ json: { memory: state.memories.find((m) => m.id === id) } })
    }
    state.deleted.push(id)
    state.memories = state.memories.filter((m) => m.id !== id)
    return route.fulfill({ status: 204 })
  })
  await page.route("**/api/memories/tidy/undo", async (route) => {
    const { index } = route.request().postDataJSON()
    state.undos.push(index)
    if (state.lastTidy) {
      state.lastTidy.changes = state.lastTidy.changes.map((c, i) => (i === index ? { ...c, undone: true } : c))
    }
    return route.fulfill({ status: 204 })
  })

  await page.route("**/api/chat", async (route) => {
    state.chatBodies.push(route.request().postDataJSON())
    if (options.chatStatus && options.chatStatus !== 200) {
      return route.fulfill({
        status: options.chatStatus,
        json: { error: "You've reached today's limit for this demo. Please come back tomorrow - I'll still remember you." },
      })
    }
    state.memories = [NEW_MEMORY, ...state.memories]
    return route.fulfill({
      headers: { "Content-Type": "text/event-stream" },
      body: sse([
        { type: "recalled", memories: [{ id: MEMORIES[1].id, content: MEMORIES[1].content, similarity: 0.81 }] },
        { type: "text", text: REPLY.slice(0, 40) },
        { type: "text", text: REPLY.slice(40) },
        { type: "remembered", memories: [{ id: NEW_MEMORY.id, content: NEW_MEMORY.content }] },
        { type: "done" },
      ]),
    })
  })

  return state
}

/**
 * Gives the page a built-in "device" that unlocks passkeys, like Face ID or Touch ID,
 * and always recognises the user. Returns the CDP session to inspect stored passkeys.
 */
export async function addVirtualAuthenticator(page: Page, options: { verified?: boolean } = {}) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("WebAuthn.enable")
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: options.verified ?? true,
      automaticPresenceSimulation: true,
    },
  })
  return { cdp, authenticatorId }
}

/** Opens the app as a signed-in guest (a real signed cookie; the API is mocked). */
export async function startSession(page: Page, name = "Sam") {
  await signInAs(page.context(), "guest", name)
  await page.goto("/app")
  await page.getByRole("textbox", { name: "Message" }).waitFor()
}

/** Makes getUserMedia fail the way a browser does, e.g. NotAllowedError. */
export async function failMicrophone(page: Page, errorName: string) {
  await page.addInitScript((name) => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("mock", name))
  }, errorName)
}

/**
 * Replaces the microphone with a generated tone: volume 0 behaves like a dead input
 * (e.g. after the computer slept), anything above that like a room with sound in it.
 */
export async function fakeMicrophone(page: Page, volume: number) {
  await page.addInitScript((gain) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext()
      const oscillator = context.createOscillator()
      const level = context.createGain()
      level.gain.value = gain
      const destination = context.createMediaStreamDestination()
      oscillator.connect(level).connect(destination)
      oscillator.start()
      return destination.stream
    }
  }, volume)
}

/** Mocks the voice token and a Scribe socket that connects but never hears words. */
export async function mockSilentScribe(page: Page) {
  await page.route("**/api/voice/token", (route) =>
    route.fulfill({ json: { token: "sutkn_test", modelId: "scribe_v2_realtime", validForSeconds: 120 } }),
  )
  await page.routeWebSocket(/api\.elevenlabs\.io/, (ws) => {
    ws.send(JSON.stringify({ message_type: "session_started", session_id: "test", config: {} }))
    ws.onMessage(() => {})
  })
}
