import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end coverage of the flows a real user actually walks, against the
 * real server and a throwaway database. These assert on what the user sees,
 * not on internals — the unit and integration suites already cover the
 * mechanisms underneath.
 */

/** Each test gets its own account so they never contend over shared state. */
function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

const PASSWORD = "e2e-password-1234";

async function register(page: Page, email: string): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("marketing homepage is public and advertises live content counts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Study for CompTIA certs");

  // The stats come from the content packs, so they must be real numbers.
  const questions = page.locator("dl dd").nth(1);
  await expect(questions).toHaveText(/\d{3}/);

  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
});

test("a protected page bounces to login and returns there afterwards", async ({ page }) => {
  const email = uniqueEmail("returnto");
  await register(page, email);
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login$/);

  // Ask for /quiz while signed out...
  await page.goto("/quiz");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  // ...and land back on it, not the dashboard.
  await expect(page).toHaveURL(/\/quiz$/);
});

test("signup, answer a quiz question, and see it reflected on the dashboard", async ({ page }) => {
  await register(page, uniqueEmail("quiz"));

  await page.getByRole("link", { name: "Quiz" }).first().click();
  await page.getByRole("button", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: "Start quiz" }).click();

  await expect(page.getByText(/Question 1 of 5/)).toBeVisible();

  // Answer the first question — whatever type it is, an MC choice is the
  // common case for a 5-question draw.
  const firstChoice = page.locator("button", { hasText: /^[A-D]/ }).first();
  await firstChoice.click();

  // Practice mode grades immediately and shows the explanation.
  await expect(page.getByText(/^(Correct|Incorrect)/).first()).toBeVisible();

  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(page.getByText("Questions answered")).toBeVisible();
  // The attempt landed and the counter moved off zero.
  await expect(page.locator("text=/^[1-9]\\d*$/").first()).toBeVisible();
});

test("marking a flashcard known persists and awards XP", async ({ page }) => {
  await register(page, uniqueEmail("flash"));

  await page.getByRole("link", { name: "Flashcards" }).first().click();
  await expect(page.getByText(/0 of \d+ known/)).toBeVisible();

  await page.getByRole("button", { name: "Got it" }).click();
  await expect(page.getByText(/1 of \d+ known/)).toBeVisible();

  // XP is awarded from the same request, so the dashboard should show it.
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(page.getByText(/XP total/)).toBeVisible();
  await expect(page.getByText("Current streak")).toBeVisible();
  await expect(page.getByText("Today already counts")).toBeVisible();
});

test("readiness is flagged low-confidence until enough questions are answered", async ({ page }) => {
  await register(page, uniqueEmail("confidence"));

  await page.getByRole("link", { name: "Quiz" }).first().click();
  await page.getByRole("button", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.locator("button", { hasText: /^[A-D]/ }).first().click();

  await page.getByRole("link", { name: "Dashboard" }).first().click();
  // One answer is nowhere near enough to trust the number, and the UI says so
  // rather than presenting a confident-looking percentage.
  await expect(page.getByText("low confidence")).toBeVisible();
  await expect(page.getByText(/more would make this trustworthy/)).toBeVisible();
});

test("setting an exam date shows a countdown", async ({ page }) => {
  await register(page, uniqueEmail("planner"));

  const target = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.getByLabel("Exam date").fill(target);
  await page.getByRole("button", { name: "Save date" }).click();

  await expect(page.getByText("21 days away")).toBeVisible();
});

test("notification preferences save and survive a reload", async ({ page }) => {
  await register(page, uniqueEmail("settings"));

  await page.getByRole("link", { name: "Settings" }).first().click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  // 14 days is off by default; turn it on.
  await page.getByRole("button", { name: "14 days" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "14 days" })).toHaveClass(/bg-primary/);

  // The master switch silences everything, and the dependent rows disable.
  await page.getByRole("switch", { name: "Email notifications" }).click();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Email notifications" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});

test("a timed exam withholds grading until submit, then scores it", async ({ page }) => {
  await register(page, uniqueEmail("exam"));

  await page.getByRole("link", { name: "Exam" }).first().click();
  await expect(page.getByRole("heading", { name: "Exam simulator" })).toBeVisible();

  // Domain drill is the shortest sitting that still exercises the machinery.
  await page.getByRole("button", { name: /Domain drill/ }).click();
  await page.getByRole("button", { name: /^4\.0/ }).click();
  await page.getByRole("button", { name: /^Start domain drill$/ }).click();

  await expect(page.getByText(/no feedback until you submit/)).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();

  // Answer the first question; the exam must not reveal whether it was right.
  await page.locator("button", { hasText: /^[A-D]/ }).first().click();
  await expect(page.getByText("Answer recorded.")).toBeVisible();
  await expect(page.getByText(/^(Correct|Incorrect)$/)).toHaveCount(0);

  await page.getByRole("button", { name: "Submit exam" }).click();
  // The confirmation names which questions are blank rather than just counting.
  await expect(page.getByText(/still blank and will be marked incorrect/)).toBeVisible();
  await page.getByRole("button", { name: "Submit", exact: true }).click();

  // Scored on the 100-900 scale with a pass/fail verdict and a review.
  await expect(page.getByText(/needed$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await expect(page.getByText(/approximation of CompTIA's 100–900 scale/)).toBeVisible();
});

test("switching certification scopes the dashboard to that exam", async ({ page }) => {
  await register(page, uniqueEmail("certswitch"));

  const selector = page.getByLabel("Active certification").first();
  await expect(selector).toHaveValue("aplus");
  await expect(page.getByText("CompTIA A+ Core 1 (220-1201)")).toBeVisible();

  await selector.selectOption("aplus-core2");
  await expect(page.getByText("CompTIA A+ Core 2 (220-1202)")).toBeVisible();

  // Core 2 has its own domains, so the breakdown must change with it.
  await expect(page.getByText("1.0 Operating Systems")).toBeVisible();
});
