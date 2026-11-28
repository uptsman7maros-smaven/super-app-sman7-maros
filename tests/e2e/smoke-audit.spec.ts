import { expect, test, type Page } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

type BrowserErrors = {
  console: string[];
  sandboxedSrcdoc: string[];
  page: string[];
  http: string[];
};

const sandboxedScriptBlockMessage =
  "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.";

function monitorBrowserErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = { console: [], sandboxedSrcdoc: [], page: [], http: [] };
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (
      message.text() === sandboxedScriptBlockMessage &&
      message.location().url === "about:srcdoc"
    ) {
      errors.sandboxedSrcdoc.push(message.text());
      return;
    }
    errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.http.push(`${response.status()} ${response.url()}`);
    }
  });
  return errors;
}

function expectNoBrowserErrors(
  errors: BrowserErrors,
  allowSandboxedSrcdocBlock = false,
) {
  const consoleErrors = allowSandboxedSrcdocBlock
    ? errors.console
    : [...errors.console, ...errors.sandboxedSrcdoc];
  expect(consoleErrors, "browser console.error").toEqual([]);
  expect(errors.sandboxedSrcdoc.length, "sandboxed srcdoc script blocks").toBeLessThanOrEqual(1);
  if (allowSandboxedSrcdocBlock && errors.sandboxedSrcdoc.length > 0) {
    console.warn("Expected sandbox protection blocked script execution in the scriptless srcdoc preview.");
  }
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
  const monthlyPreview = page.getByTitle("Pratinjau langsung rekap bulanan");
  await expect(monthlyPreview).toHaveAttribute("sandbox", "allow-same-origin");
  await expect(page.locator("iframe[srcdoc]")).toHaveCount(1);
  const monthlyPreviewHtml = await monthlyPreview.getAttribute("srcdoc");
  if (monthlyPreviewHtml === null) {
    throw new Error("Pratinjau rekap bulanan tidak memiliki dokumen srcdoc.");
  }
  expect(monthlyPreviewHtml).not.toMatch(/<script\b/i);
  expect(monthlyPreviewHtml).not.toMatch(/\son[a-z]+\s*=/i);

  await page.waitForTimeout(1_000);
  expectNoBrowserErrors(errors, true);
});
