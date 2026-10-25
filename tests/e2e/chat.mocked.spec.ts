import { expect, test } from "@playwright/test"
import { MEMORIES, NEW_MEMORY, REPLY, mockBackend, startSession } from "./mocks"

test("a new visitor sees the welcome screen and how it works", async ({ page }) => {
  await mockBackend(page)
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /Every conversation leaves a star/ })).toBeVisible()
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Begin" })).toBeDisabled()
})

test("chatting streams a reply and shows the memories it used and added", async ({ page }) => {
  const backend = await mockBackend(page)
  await startSession(page)

  await expect(page.getByText(MEMORIES[0].content)).toBeVisible()
  await expect(page.getByText("demo · 40 messages left today")).toBeVisible()

  const box = page.getByRole("textbox", { name: "Message" })
  await box.fill("I skipped my long run today.")
  await box.press("Enter")

  await expect(page.getByText(REPLY)).toBeVisible()
  const chips = page.getByRole("list", { name: "Memories for this reply" })
  await expect(chips.getByText(MEMORIES[1].content)).toBeVisible()
  await expect(chips.getByText(`+ New star: ${NEW_MEMORY.content}`)).toBeVisible()

  // The panel refetches and marks the new and the recalled star.
  const panel = page.locator("#constellation-panel")
  await expect(panel.getByRole("img", { name: `Memory: ${NEW_MEMORY.content} (new)` })).toBeVisible()
  await expect(panel.getByRole("img", { name: `Memory: ${MEMORIES[1].content} (shaped the last reply)` })).toBeVisible()
  await expect(page.getByText("demo · 39 messages left today")).toBeVisible()
  expect(backend.chatBodies).toEqual([{ message: "I skipped my long run today.", mode: "text" }])
})

test("forgetting a memory removes it from the constellation", async ({ page }) => {
  const backend = await mockBackend(page)
  await startSession(page)
  await page.getByRole("button", { name: `Forget: ${MEMORIES[2].content}` }).click()
  await expect(page.locator("#constellation-panel").getByText(MEMORIES[2].content)).toHaveCount(0)
  expect(backend.deleted).toEqual([MEMORIES[2].id])
})

test("hitting a demo limit explains what happened", async ({ page }) => {
  await mockBackend(page, { chatStatus: 429 })
  await startSession(page)
  const box = page.getByRole("textbox", { name: "Message" })
  await box.fill("Hello")
  await box.press("Enter")
  await expect(page.getByRole("region", { name: "Conversation" }).getByRole("alert")).toContainText("today's limit")
})

test("no messages left disables the composer", async ({ page }) => {
  await mockBackend(page, { remainingToday: 0 })
  await startSession(page)
  await expect(page.getByRole("textbox", { name: "Message" })).toBeDisabled()
  await expect(page.getByText(/today's messages are used up/)).toBeVisible()
})

test("forget everything returns to the welcome screen", async ({ page }) => {
  await mockBackend(page)
  await startSession(page)
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "Account menu for Sam" }).click()
  await page.getByRole("menuitem", { name: /Forget everything/ }).click()
  await expect(page.getByLabel("What should I call you?")).toBeVisible()
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("the constellation opens as a drawer and closes with Escape", async ({ page }) => {
    await mockBackend(page)
    await startSession(page)
    const panel = page.locator("#constellation-panel")
    await expect(panel).toBeHidden()
    await page.getByRole("button", { name: /open constellation/ }).click()
    await expect(panel.getByText(MEMORIES[0].content)).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(panel).toBeHidden()
  })
})
