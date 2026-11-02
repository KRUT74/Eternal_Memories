import { expect, test } from "@playwright/test"
import { MEMORIES, mockBackend, startSession } from "./mocks"

test("core memories are grouped as always in mind", async ({ page }) => {
  const backend = await mockBackend(page)
  backend.memories = backend.memories.map((m, i) => (i === 0 ? { ...m, is_core: true } : m))
  await startSession(page)
  const panel = page.locator("#constellation-panel")
  await expect(panel.getByRole("heading", { name: "Always in mind" })).toBeVisible()
  await expect(panel.getByRole("heading", { name: "Other memories" })).toBeVisible()
  const always = panel.getByRole("group", { name: "Always in mind" }).getByRole("listitem")
  await expect(always).toHaveText([MEMORIES[0].content])
  await expect(panel.getByRole("img", { name: `Memory: ${MEMORIES[0].content} (always in mind)` })).toBeVisible()
})

test("pinning a memory keeps it always in mind", async ({ page }) => {
  const backend = await mockBackend(page)
  await startSession(page)
  const panel = page.locator("#constellation-panel")
  await expect(panel.getByRole("heading", { name: "Always in mind" })).toHaveCount(0)

  const pin = panel.getByRole("button", { name: `Always remember: ${MEMORIES[2].content}` })
  await expect(pin).toHaveAttribute("aria-pressed", "false")
  await pin.click()
  await expect(pin).toHaveAttribute("aria-pressed", "true")
  await expect(panel.getByRole("heading", { name: "Always in mind" })).toBeVisible()
  expect(backend.pins).toEqual([{ id: MEMORIES[2].id, pinned: true }])

  await pin.click()
  await expect(pin).toHaveAttribute("aria-pressed", "false")
  expect(backend.pins).toEqual([
    { id: MEMORIES[2].id, pinned: true },
    { id: MEMORIES[2].id, pinned: false },
  ])
})

test("a tidy-up shows what changed, and each change can be undone", async ({ page }) => {
  const backend = await mockBackend(page)
  backend.lastTidy = {
    id: "5f0e1d2c-3b4a-4958-8776-655443322110",
    created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    merged: 1,
    updated: 0,
    retired: 1,
    core_changed: 0,
    changes: [
      {
        op: "merge",
        sources: [
          { id: "a", content: "Their brother Leo lives in Lisbon." },
          { id: "b", content: "Leo moved to Lisbon in March." },
        ],
        created: { id: "c", content: "Their brother Leo moved to Lisbon in March." },
        reason: "Both are about Leo's move",
      },
      { op: "retire", id: "d", content: "Their brother Leo lives in Porto.", reason: "Leo now lives in Lisbon" },
    ],
  }
  await startSession(page)
  const panel = page.locator("#constellation-panel")
  await expect(panel.getByText("Tidied 2 days ago: combined 1, set aside 1.")).toBeVisible()

  await panel.getByText("What changed").click()
  await expect(panel.getByText("Set aside “Their brother Leo lives in Porto.”")).toBeVisible()
  await panel.getByRole("button", { name: "Undo: Set aside “Their brother Leo lives in Porto.”" }).click()
  await expect(panel.getByText("undone")).toBeVisible()
  expect(backend.undos).toEqual([1])

  await panel.getByRole("button", { name: "Tidy up now" }).click()
  await expect.poll(() => backend.tidyRequests).toBe(1)
})
