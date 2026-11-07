import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { addVirtualAuthenticator, mockBackend, signInAs, startSession } from "./mocks"

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)
  expect(summary).toEqual([])
}

test("landing page has no WCAG A/AA violations", async ({ page }) => {
  await mockBackend(page)
  await page.goto("/")
  await expectNoViolations(page)
})

test("the code entry step has no WCAG A/AA violations", async ({ page }) => {
  await mockBackend(page)
  await page.goto("/")
  await page.getByLabel("Email", { exact: true }).fill("sam@example.com")
  await page.getByRole("button", { name: "Email me a sign-in code" }).click()
  await page.getByLabel("6-digit code").waitFor()
  await expectNoViolations(page)
})

test("privacy page has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/privacy")
  await expectNoViolations(page)
})

test("chat with a reply and the constellation has no WCAG A/AA violations", async ({ page }) => {
  await mockBackend(page)
  await startSession(page)
  const box = page.getByRole("textbox", { name: "Message" })
  await box.fill("I skipped my long run today.")
  await box.press("Enter")
  await expect(page.getByText(/One skipped long run/)).toBeVisible()
  await expectNoViolations(page)
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test("the open constellation drawer has no WCAG A/AA violations", async ({ page }) => {
    await mockBackend(page)
    await startSession(page)
    await page.getByRole("button", { name: /open constellation/ }).click()
    await expect(page.locator("#constellation-panel").getByText("They live in Barcelona.")).toBeVisible()
    await expectNoViolations(page)
  })
})

test("the constellation can be explored with the keyboard", async ({ page }) => {
  await mockBackend(page)
  await startSession(page)
  const star = page.getByRole("img", { name: /^Memory: They live in Barcelona/ })
  await star.focus()
  await expect(star).toBeFocused()
  // Focusing a star highlights the matching memory in the list.
  await expect(page.locator("#constellation-panel li[data-active]")).toHaveText("They live in Barcelona.")
  // Stars are in the order they were learned; Shift+Tab walks back to the previous one.
  await page.keyboard.press("Shift+Tab")
  await expect(page.locator("#constellation-panel li[data-active]")).toHaveText("They are training for a half marathon in March.")
})

test("the face sign-in prompt has no WCAG A/AA violations", async ({ page }) => {
  await mockBackend(page)
  await addVirtualAuthenticator(page)
  await signInAs(page.context(), "email")
  await page.goto("/app")
  await page.getByRole("button", { name: "Set up face sign-in" }).waitFor()
  await expectNoViolations(page)
})

test("the memory panel with pins and a tidy-up has no WCAG A/AA violations", async ({ page }) => {
  const backend = await mockBackend(page)
  backend.memories = backend.memories.map((m, i) => (i === 0 ? { ...m, is_core: true, pinned: true } : m))
  backend.lastTidy = {
    id: "5f0e1d2c-3b4a-4958-8776-655443322110",
    created_at: new Date().toISOString(),
    merged: 0,
    updated: 0,
    retired: 1,
    core_changed: 0,
    changes: [{ op: "retire", id: "d", content: "Their brother Leo lives in Porto.", reason: "Leo now lives in Lisbon" }],
  }
  await startSession(page)
  await page.locator("#constellation-panel").getByText("What changed").click()
  await expectNoViolations(page)
})

test("a chat that opens with a greeting has no WCAG A/AA violations", async ({ page }) => {
  const backend = await mockBackend(page)
  backend.greeting = { text: "Hello Sam. How did the run go?" }
  await startSession(page)
  await page.getByText("Hello Sam. How did the run go?").waitFor()
  await expectNoViolations(page)
})
