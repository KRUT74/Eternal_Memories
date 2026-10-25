// Opt-in: runs against the real Claude, Supabase and ElevenLabs services using the
// keys in .env.local, and costs a few cents. Run with `pnpm test:e2e:live`.
import { readFileSync, writeFileSync } from "node:fs"
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js"
import { chromium, expect, test, type Page } from "@playwright/test"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
)

async function startSession(page: Page, name: string) {
  await page.goto("/")
  await page.getByLabel("What should I call you?").fill(name)
  await page.getByRole("button", { name: "Begin" }).click()
  await page.getByRole("textbox", { name: "Message" }).waitFor()
}

async function forgetEverything(page: Page) {
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: /Account menu/ }).click()
  await page.getByRole("menuitem", { name: /Forget everything/ }).click()
  await expect(page.getByLabel("What should I call you?")).toBeVisible()
}

async function say(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: "Message" })
  await box.fill(text)
  await box.press("Enter")
  await expect(box).toBeEnabled({ timeout: 60_000 })
}

test("it remembers a fact and uses it later", async ({ page }) => {
  await startSession(page, "Robin")
  await say(page, "My dog is a greyhound called Biscuit.")
  await expect(page.getByText(/\+ New star: .*Biscuit/)).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("#constellation-panel").getByText(/Biscuit/)).toBeVisible()

  await say(page, "What should I name the new chew toy I bought for my dog?")
  const replies = page.locator("div.reply-prose")
  await expect(replies.last()).toContainText(/Biscuit|greyhound/i)
  await expect(page.getByRole("list", { name: "Memories for this reply" }).last()).toContainText("Biscuit")

  await forgetEverything(page)
})

test("a hands-free voice turn with a recorded voice as the microphone", async ({ baseURL }, testInfo) => {
  // Record "the user" with a different ElevenLabs voice, followed by silence.
  const elevenlabs = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY })
  const stream = await elevenlabs.textToSpeech.stream("t0ES0NNCGSEHxmzC9j9v", {
    text: "Hi! My sister Ana is getting married in Lisbon next June.",
    modelId: "eleven_flash_v2_5",
    outputFormat: "pcm_16000",
  })
  const parts: Buffer[] = []
  const reader = stream.getReader()
  for (let r = await reader.read(); !r.done; r = await reader.read()) parts.push(Buffer.from(r.value))
  const pcm = Buffer.concat([Buffer.alloc(32000), ...parts, Buffer.alloc(32000 * 30)])
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write("WAVEfmt ", 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(16000, 24)
  header.writeUInt32LE(32000, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36)
  header.writeUInt32LE(pcm.length, 40)
  const wav = testInfo.outputPath("fake-mic.wav")
  writeFileSync(wav, Buffer.concat([header, pcm]))

  const browser = await chromium.launch({
    channel: process.env.CI ? undefined : "chrome",
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`],
  })
  const context = await browser.newContext({ baseURL, permissions: ["microphone"] })
  const page = await context.newPage()
  await startSession(page, "Sam")

  await page.getByRole("button", { name: "Start voice conversation" }).click()
  const bar = page.getByRole("group", { name: "Voice conversation" })
  await expect(bar.getByText("Listening…")).toBeVisible({ timeout: 15_000 })
  await expect(page.locator("div.self-end").last()).toContainText(/Lisbon/, { timeout: 20_000 })
  await expect(bar.getByText(/Speaking/)).toBeVisible({ timeout: 20_000 })
  await expect(page.locator("div.reply-prose").last()).toContainText(/Lisbon|wedding/i)
  await expect(bar.getByText("Listening…")).toBeVisible({ timeout: 30_000 })

  await page.keyboard.press("Escape")
  await forgetEverything(page)
  await browser.close()
})
