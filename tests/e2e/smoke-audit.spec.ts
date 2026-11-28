import { expect, test, type Page } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

type BrowserErrors = {
  console: string[];
  page: string[];
  http: string[];
};

function monitorBrowserErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = { console: [], page: [], http: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.http.push(`${response.status()} ${response.url()}`);
    }
  });
  return errors;
}

function expectNoBrowserErrors(errors: BrowserErrors) {
  expect(errors.console, "browser console.error").toEqual([]);
  expect(errors.page, "uncaught page errors").toEqual([]);
  expect(errors.http, "HTTP responses with status >= 400").toEqual([]);
}

test.beforeAll(() => {
  if (!username || !password) {
    console.warn(
      "PERINGATAN: E2E_USERNAME/E2E_PASSWORD belum diisi; uji pasca-login dilewati. Uji login pre-auth tetap berjalan.",
    );
  }
});

test("pre-auth page loads and login form is usable", async ({ page }) => {
  const errors = monitorBrowserErrors(page);

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Masuk ke Super App" }),
  ).toBeVisible();

  const usernameInput = page.getByLabel("Username", { exact: true });
  const passwordInput = page.getByLabel("Password", { exact: true });
  await expect(usernameInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(usernameInput).toHaveAttribute("required", "");
  await expect(passwordInput).toHaveAttribute("required", "");

  await page.getByRole("button", { name: /Masuk ke Super App/ }).click();
  const usernameIsRequired = await usernameInput.evaluate(
    (input) => input.matches(":invalid"),
  );
  expect(usernameIsRequired).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Masuk ke Super App" }),
  ).toBeVisible();

  await page.waitForTimeout(500);
  expectNoBrowserErrors(errors);
});

test("authenticated dashboard and active modules load without browser errors", async ({
  page,
}) => {
  test.skip(
    !username || !password,
    "E2E_USERNAME/E2E_PASSWORD belum diisi; uji pasca-login tidak dijalankan.",
  );
  const errors = monitorBrowserErrors(page);

  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: /Masuk ke Super App/ }).click();

  await expect(
    page.getByRole("heading", { name: /Super App SMAN 7 Maros/ }),
  ).toBeVisible({ timeout: 60_000 });

  const refreshButton = page.getByRole("button", {
    name: /Perbarui ringkasan|Memperbarui kartu/,
  });
  await expect(refreshButton).toBeVisible();
  await refreshButton.click();
  await expect(
    page.getByRole("button", { name: "Perbarui ringkasan" }),
  ).toBeEnabled({ timeout: 60_000 });

  const sidebar = page.locator("nav.sidebar-nav");
  await sidebar.getByRole("button", { name: "Persuratan" }).click();
  await expect(
    page.getByRole("heading", { name: "Persuratan Digital" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Super App" }).click();
  await expect(
    page.getByRole("heading", { name: /Super App SMAN 7 Maros/ }),
  ).toBeVisible();
  await sidebar.getByRole("button", { name: "Absensi Digital" }).click();
  await expect(
    page.getByRole("heading", { name: "Absensi Digital" }),
  ).toBeVisible();

  await page.waitForTimeout(1_000);
  expectNoBrowserErrors(errors);
});
