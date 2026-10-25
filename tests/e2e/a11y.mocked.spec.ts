import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { mockBackend, startSession } from "./mocks"

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)
  expect(summary).toEqual([])
}

test("welcome screen has no WCAG A/AA violations", async ({ page }) => {
  await mockBackend(page)
  await page.goto("/")
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
