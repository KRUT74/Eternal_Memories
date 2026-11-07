import { expect, test } from "@playwright/test"
import { MEMORIES, mockBackend, startSession } from "./mocks"

const GREETING = "Hello Sam, good morning. How did the half marathon training go this week?"

test("on a new visit the companion speaks first", async ({ page }) => {
  const backend = await mockBackend(page)
  backend.greeting = { text: GREETING }
  await startSession(page)
  await expect(page.getByText(GREETING)).toBeVisible()
  await expect(page.getByText("Every conversation leaves a memory.")).toHaveCount(0)
})

test("no greeting when they were only just here", async ({ page }) => {
  const backend = await mockBackend(page)
  await startSession(page)
  await expect.poll(() => backend.greetingRequests).toBe(1)
  await expect(page.getByText("Every conversation leaves a memory.")).toBeVisible()
})

test("at the limit, a plain hello still appears", async ({ page }) => {
  const backend = await mockBackend(page)
  backend.greeting = { fallback: "Hello, Sam. It's good to see you." }
  await startSession(page)
  await expect(page.getByText("Hello, Sam. It's good to see you.")).toBeVisible()
})

test("if they start talking first, the greeting is dropped", async ({ page }) => {
  const backend = await mockBackend(page)
  backend.greeting = { text: GREETING }
  let release = () => {}
  backend.holdGreeting = new Promise((resolve) => (release = resolve))
  await startSession(page)
  await expect.poll(() => backend.greetingRequests).toBe(1)

  const box = page.getByRole("textbox", { name: "Message" })
  await box.fill("I skipped my long run today.")
  await box.press("Enter")
  await expect(page.getByText(/One skipped long run/)).toBeVisible()
  release()
  await page.waitForTimeout(300)
  await expect(page.getByText(GREETING)).toHaveCount(0)
})

test("lines join related memories in the constellation", async ({ page }) => {
  const backend = await mockBackend(page)
  backend.memories = [
    { ...MEMORIES[0], subject: "Leo", category: "person" },
    { ...MEMORIES[1], subject: "Leo", category: "person" },
    { ...MEMORIES[2], subject: null, category: "other" },
  ]
  await startSession(page)
  await expect(page.locator('[data-testid="memory-link"]')).toHaveCount(1)
})
