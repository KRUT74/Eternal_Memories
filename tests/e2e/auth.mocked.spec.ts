import { expect, test } from "@playwright/test"
import { MEMORIES, mockBackend, signInAs } from "./mocks"

test("signing in with an emailed code opens the app", async ({ page }) => {
  const backend = await mockBackend(page)
  await page.goto("/")
  await page.getByLabel("Email", { exact: true }).fill("Sam@Example.com")
  await page.getByRole("button", { name: "Email me a sign-in code" }).click()

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()
  await expect(page.getByText(/We sent a 6-digit code to Sam@Example.com/)).toBeVisible()
  await expect(page.getByRole("button", { name: /Resend in \d+s/ })).toBeDisabled()
  expect(backend.codeRequests).toEqual(["Sam@Example.com"])

  const code = page.getByLabel("6-digit code")
  await expect(code).toBeFocused()
  await code.fill("12a3456")
  await expect(code).toHaveValue("123456")
  await page.getByRole("button", { name: "Sign in" }).click()

  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByText(MEMORIES[0].content)).toBeVisible()
  await page.getByRole("button", { name: "Account menu for Sam" }).click()
  await expect(page.getByText("Signed in as sa•••@example.com")).toBeVisible()
})

test("a wrong code says so and lets you try again", async ({ page }) => {
  await mockBackend(page)
  await page.goto("/")
  await page.getByLabel("Email", { exact: true }).fill("sam@example.com")
  await page.getByRole("button", { name: "Email me a sign-in code" }).click()
  await page.getByLabel("6-digit code").fill("000000")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "That code isn't right" })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole("button", { name: "Use a different email" }).click()
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("sam@example.com")
})

test("guests can still try it without an email", async ({ page }) => {
  await mockBackend(page)
  await page.goto("/")
  await page.getByLabel("Just try it, no email").fill("Robin")
  await page.getByRole("button", { name: "Continue as a guest" }).click()
  await expect(page).toHaveURL(/\/app$/)
  await page.getByRole("button", { name: "Account menu for Robin" }).click()
  await expect(page.getByText(/Guest · memories are kept in this browser only/)).toBeVisible()
})

test("a guest can save their memories with email", async ({ page }) => {
  await mockBackend(page)
  await signInAs(page.context(), "guest")
  await page.goto("/app")
  await page.getByRole("button", { name: "Account menu for Sam" }).click()
  await page.getByRole("menuitem", { name: "Save your memories with email" }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toHaveAccessibleName("Keep your memories on any device")
  await dialog.getByLabel("Email", { exact: true }).fill("sam@example.com")
  await dialog.getByRole("button", { name: "Email me a sign-in code" }).click()
  await expect(dialog).toHaveAccessibleName("Check your email")
  await dialog.getByLabel("6-digit code").fill("123456")
  await dialog.getByRole("button", { name: "Sign in" }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByText(MEMORIES[0].content)).toBeVisible()
  await page.getByRole("button", { name: "Account menu for Sam" }).click()
  await expect(page.getByText("Signed in as sa•••@example.com")).toBeVisible()
})

test("a returning visitor gets a Continue button instead of the form", async ({ page }) => {
  await mockBackend(page)
  await signInAs(page.context(), "email", "Sam")
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Welcome back, Sam" })).toBeVisible()
  await page.getByRole("link", { name: "Continue" }).click()
  await expect(page).toHaveURL(/\/app$/)
})

test("the app sends visitors without a session to the landing page", async ({ page }) => {
  await page.goto("/app")
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("heading", { name: "Sign in to your constellation" })).toBeVisible()
})

test("the privacy page explains what is stored", async ({ page }) => {
  await page.goto("/privacy")
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible()
  await expect(page.getByText(/Forget everything/)).toBeVisible()
})

test("a returning guest can add their email right from the main page", async ({ page }) => {
  await mockBackend(page)
  await signInAs(page.context(), "guest", "Sam")
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Welcome back, Sam" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Keep your memories on any device" })).toBeVisible()
  await page.getByLabel("Email", { exact: true }).fill("sam@example.com")
  await page.getByRole("button", { name: "Email me a sign-in code" }).click()
  await page.getByLabel("6-digit code").fill("123456")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app$/)
  await page.getByRole("button", { name: "Account menu for Sam" }).click()
  await expect(page.getByText("Signed in as sa•••@example.com")).toBeVisible()
})
