import { expect, test } from "@playwright/test"
import { failMicrophone, fakeMicrophone, mockBackend, mockSilentScribe, startSession } from "./mocks"

test.describe("microphone problems get specific advice", () => {
  for (const [errorName, message] of [
    ["NotAllowedError", /Microphone access is blocked for this site/],
    ["NotFoundError", /No microphone was found/],
    ["NotReadableError", /may be in use by another app/],
  ] as const) {
    test(errorName, async ({ page }) => {
      await failMicrophone(page, errorName)
      await mockBackend(page)
      await startSession(page)
      await page.getByRole("button", { name: "Start voice conversation" }).click()
      await expect(page.getByRole("region", { name: "Conversation" }).getByRole("alert")).toContainText(message)
      await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible()
    })
  }
})

test("a hands-free turn: listen, think, reply, listen again", async ({ page }) => {
  const backend = await mockBackend(page)
  await page.route("**/api/voice/token", (route) =>
    route.fulfill({ json: { token: "sutkn_test", modelId: "scribe_v2_realtime", validForSeconds: 300 } }),
  )
  // Not real audio: the player fails fast and moves on, which is all this test needs.
  await page.route("**/api/voice/speak", (route) => route.fulfill({ headers: { "Content-Type": "audio/mpeg" }, body: "" }))

  // Stand-in for ElevenLabs Scribe: start a session, then "hear" one sentence.
  await page.routeWebSocket(/api\.elevenlabs\.io/, (ws) => {
    ws.send(JSON.stringify({ message_type: "session_started", session_id: "test", config: {} }))
    setTimeout(() => ws.send(JSON.stringify({ message_type: "partial_transcript", text: "I skipped my" })), 400)
    setTimeout(
      () => ws.send(JSON.stringify({ message_type: "committed_transcript", text: "I skipped my long run today." })),
      800,
    )
    ws.onMessage(() => {})
  })

  await startSession(page)
  await page.getByRole("button", { name: "Start voice conversation" }).click()

  const bar = page.getByRole("group", { name: "Voice conversation" })
  await expect(bar.getByText("Listening…")).toBeVisible()
  await expect(page.getByText("I skipped my long run today.")).toBeVisible()
  await expect(page.getByText(/One skipped long run/)).toBeVisible()
  await expect(bar.getByText("Listening…")).toBeVisible()
  expect(backend.chatBodies).toEqual([{ message: "I skipped my long run today.", mode: "voice" }])

  await page.keyboard.press("Escape")
  await expect(bar).toBeHidden()
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible()
})

test.describe("when no words arrive, the advice depends on what the microphone hears", () => {
  test("a dead microphone is called out, with the reload tip", async ({ page }) => {
    await fakeMicrophone(page, 0)
    await mockBackend(page)
    await mockSilentScribe(page)
    await startSession(page)
    await page.getByRole("button", { name: "Start voice conversation" }).click()
    const bar = page.getByRole("group", { name: "Voice conversation" })
    await expect(bar.getByText("Listening…")).toBeVisible()
    await expect(bar.getByRole("meter", { name: "Microphone level" })).toHaveAttribute("aria-valuenow", "0")
    await expect(bar.getByText(/No sound is reaching your microphone. Reload this page/)).toBeVisible({ timeout: 12_000 })
  })

  test("sound without words gets a gentle nudge instead", async ({ page }) => {
    await fakeMicrophone(page, 0.3)
    await mockBackend(page)
    await mockSilentScribe(page)
    await startSession(page)
    await page.getByRole("button", { name: "Start voice conversation" }).click()
    const bar = page.getByRole("group", { name: "Voice conversation" })
    await expect(bar.getByRole("meter", { name: "Microphone level" })).not.toHaveAttribute("aria-valuenow", "0")
    await expect(bar.getByText(/I can hear sound but no words yet/)).toBeVisible({ timeout: 12_000 })
  })
})
