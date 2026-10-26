import type { Page } from "@playwright/test"

export interface MockMemory {
  id: string
  content: string
  created_at: string
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
  const state = {
    signedIn: false,
    memories: [...MEMORIES],
    chatBodies: [] as Array<{ message: string; mode?: string }>,
    deleted: [] as string[],
  }

  await page.route("**/api/session", async (route) => {
    const method = route.request().method()
    if (method === "POST") {
      state.signedIn = true
      return route.fulfill({ status: 201, json: { name: route.request().postDataJSON().name } })
    }
    if (method === "DELETE") {
      state.signedIn = false
      return route.fulfill({ status: 204 })
    }
    return state.signedIn
      ? route.fulfill({ json: { name: "Sam", remainingToday: options.remainingToday ?? 40 } })
      : route.fulfill({ status: 401, json: { error: "No session" } })
  })

  await page.route("**/api/history", (route) => route.fulfill({ json: { messages: [] } }))
  await page.route("**/api/memories", (route) => route.fulfill({ json: { memories: state.memories } }))
  await page.route("**/api/memories/*", async (route) => {
    const id = route.request().url().split("/").pop()!
    state.deleted.push(id)
    state.memories = state.memories.filter((m) => m.id !== id)
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

/** Starts a session through the welcome form. */
export async function startSession(page: Page, name = "Sam") {
  await page.goto("/")
  await page.getByLabel("What should I call you?").fill(name)
  await page.getByRole("button", { name: "Begin" }).click()
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
