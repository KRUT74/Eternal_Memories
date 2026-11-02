import { expect, test } from "@playwright/test"
import { addVirtualAuthenticator, mockBackend, signInAs } from "./mocks"

test("an email account sets up face sign-in, then signs back in by face", async ({ page }) => {
  const backend = await mockBackend(page)
  const { cdp, authenticatorId } = await addVirtualAuthenticator(page)
  await signInAs(page.context(), "email")
  await page.goto("/app")

  const prompt = page.getByRole("region", { name: "Next time, sign in with just your face" })
  await expect(prompt).toBeVisible()
  await prompt.getByRole("button", { name: "Set up face sign-in" }).click()
  await expect(page.getByRole("heading", { name: "Face sign-in is on" })).toBeVisible()
  await expect(page.getByText(/On this Mac, tap "Sign in with your face"/)).toBeVisible()

  // The passkey lives on the device; the server got only its ID (and, for real, its public key).
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId })
  expect(credentials).toHaveLength(1)
  expect(credentials[0].isResidentCredential).toBe(true)
  // CDP reports the ID as base64; WebAuthn sends it as base64url.
  const passkeyId = Buffer.from(credentials[0].credentialId, "base64").toString("base64url")
  expect(backend.passkeys.map((p) => p.id)).toEqual([passkeyId])

  await page.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("heading", { name: "Face sign-in is on" })).toBeHidden()
  await page.getByRole("button", { name: "Account menu for Sam" }).click()
  await expect(page.getByText("Face sign-in on Mac")).toBeVisible()
  await page.getByRole("menuitem", { name: "Sign out" }).click()

  await expect(page).toHaveURL(/\/$/)
  await page.getByRole("button", { name: "Sign in with your face" }).click()
  await expect(page).toHaveURL(/\/app$/)
  expect(backend.faceSignIns).toEqual([passkeyId])
  await page.getByRole("button", { name: "Account menu for Sam" }).click()
  await expect(page.getByText("Signed in as sa•••@example.com")).toBeVisible()
})

test("face sign-in can be turned off from the account menu", async ({ page }) => {
  const backend = await mockBackend(page)
  await addVirtualAuthenticator(page)
  backend.passkeys.push({ id: "pk_test", device_label: "iPhone", created_at: "2026-11-01T10:00:00Z", last_used_at: null })
  await signInAs(page.context(), "email")
  await page.goto("/app")
  await page.getByRole("button", { name: "Account menu for Sam" }).click()
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("menuitem", { name: "Turn off face sign-in on iPhone" }).click()
  await expect(page.getByText("Face sign-in on iPhone")).toBeHidden()
  await expect(page.getByRole("menuitem", { name: "Set up face sign-in" })).toBeVisible()
  expect(backend.passkeys).toEqual([])
})

test("face sign-in can be added on a second device", async ({ page }) => {
  const backend = await mockBackend(page)
  await addVirtualAuthenticator(page)
  backend.passkeys.push({ id: "pk_other", device_label: "Mac", created_at: "2026-11-01T10:00:00Z", last_used_at: null })
  await signInAs(page.context(), "email")
  await page.goto("/app")
  await page.getByRole("button", { name: "Account menu for Sam" }).click()
  await page.getByRole("menuitem", { name: "Set up face sign-in on this device" }).click()
  await expect(page.getByText("Face sign-in on Mac")).toHaveCount(2)
  expect(backend.passkeys).toHaveLength(2)
})

test("with no face sign-in on this device, it says so and offers email", async ({ page }) => {
  await mockBackend(page)
  await addVirtualAuthenticator(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Sign in with your face" }).click()
  await expect(
    page.getByRole("alert").filter({ hasText: /Face sign-in was cancelled or timed out|didn't work on this device/ }),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible()
})

test("the setup prompt can be dismissed and stays away", async ({ page }) => {
  await mockBackend(page)
  await addVirtualAuthenticator(page)
  await signInAs(page.context(), "email")
  await page.goto("/app")
  await page.getByRole("button", { name: "Not now" }).click()
  await expect(page.getByRole("region", { name: "Next time, sign in with just your face" })).toBeHidden()
  await page.reload()
  await page.getByRole("textbox", { name: "Message" }).waitFor()
  await expect(page.getByRole("region", { name: "Next time, sign in with just your face" })).toBeHidden()
})

test("guests aren't offered face sign-in set-up", async ({ page }) => {
  await mockBackend(page)
  await addVirtualAuthenticator(page)
  await signInAs(page.context(), "guest")
  await page.goto("/app")
  await page.getByRole("textbox", { name: "Message" }).waitFor()
  await expect(page.getByRole("region", { name: "Next time, sign in with just your face" })).toBeHidden()
  await page.getByRole("button", { name: "Account menu for Sam" }).click()
  await expect(page.getByRole("menuitem", { name: "Set up face sign-in" })).toBeHidden()
})
