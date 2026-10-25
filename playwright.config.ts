import { defineConfig, devices } from "@playwright/test"

const PORT = 3200
const live = process.env.E2E_LIVE === "1"

// Use the locally installed Chrome when available (no browser download needed);
// CI installs Playwright's Chromium instead.
const channel = process.env.CI ? undefined : "chrome"

// A fake microphone, so voice can be tested without a person speaking.
const fakeMicArgs = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      // Free and deterministic: every /api call and the ElevenLabs socket are mocked.
      name: "mocked",
      testMatch: /.*\.mocked\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], channel, launchOptions: { args: fakeMicArgs } },
    },
    ...(live
      ? [
          {
            // Opt-in (E2E_LIVE=1): real Claude, Supabase and ElevenLabs calls. Costs a few cents.
            name: "live",
            testMatch: /.*\.live\.spec\.ts/,
            timeout: 120_000,
            use: { ...devices["Desktop Chrome"], channel },
          },
        ]
      : []),
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Generous limits so repeated test runs don't trip the demo's own protections.
    env: { DEMO_IP_SESSIONS_PER_DAY: "1000", DEMO_IP_CHATS_PER_DAY: "1000" },
  },
})
