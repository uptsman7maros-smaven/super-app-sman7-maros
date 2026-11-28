import { loadEnv } from "vite";
import { defineConfig } from "@playwright/test";

const localEnv = loadEnv("test", process.cwd(), "");
for (const name of ["E2E_USERNAME", "E2E_PASSWORD"]) {
  if (!process.env[name] && localEnv[name]) process.env[name] = localEnv[name];
}

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:4173",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
});
