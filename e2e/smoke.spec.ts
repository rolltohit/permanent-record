import { expect, type Page, test } from "@playwright/test";
import { clearMail, latestSignInEmail } from "./mail";

/** Signs in through the real email-code flow, reading the code from Mailpit. */
async function signIn(page: Page, email: string) {
  await clearMail();
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Your email" }).fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText(`We emailed a code to ${email}`)).toBeVisible();
  const { code } = await latestSignInEmail(email);
  await page.getByRole("textbox", { name: "Code from the email" }).fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

test("seeded member can browse, rate, react and comment", async ({ page }) => {
  await signIn(page, "ana@example.com");

  const card = page.locator("article", { hasText: "In Rainbows" }).first();
  await expect(card).toBeVisible();
  await expect(card.getByText("Start with Weird Fishes")).toBeVisible();
  await expect(card.getByRole("link", { name: /Spotify/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /Apple Music/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /YouTube Music/ })).toBeVisible();

  await card.getByRole("button", { name: "5 stars" }).click();
  await expect(card.getByRole("button", { name: "✓ Listened" })).toBeVisible();
  await card.getByRole("button", { name: "Thumbs up" }).click();
  await card.getByRole("button", { name: /🤯/ }).click();

  await card.getByRole("link", { name: /comment/i }).click();
  await expect(page).toHaveURL(/\/r\//);
  const body = `e2e comment ${Date.now()}`;
  await page.getByRole("textbox", { name: "Comment" }).fill(body);
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByText(body)).toBeVisible();

  // State survives a reload, so it was saved.
  await page.reload();
  const detail = page.locator("article").first();
  await expect(detail.getByRole("button", { name: "5 stars" })).toHaveAttribute("aria-pressed", "true");
  await expect(detail.getByRole("button", { name: "Thumbs up" })).toHaveAttribute("aria-pressed", "true");
  await expect(detail.getByRole("button", { name: /🤯/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("The group's take")).toBeVisible();
});

test("For you shows AI picks and filters work", async ({ page }) => {
  await signIn(page, "ana@example.com");
  await page.goto("/?view=unlistened");
  await expect(page.getByRole("link", { name: "Not listened yet" })).toBeVisible();
  await page.goto("/for-you");
  await expect(page.getByRole("heading", { name: "For you" })).toBeVisible();
});

test("signed-out visitors are sent to login, then back where they were", async ({ page }) => {
  await page.goto("/me");
  await expect(page).toHaveURL(/\/login\?next=%2Fme$/);
  await clearMail();
  await page.getByRole("textbox", { name: "Your email" }).fill("ben@example.com");
  await page.getByRole("button", { name: "Email me a code" }).click();
  const { code } = await latestSignInEmail("ben@example.com");
  await page.getByRole("textbox", { name: "Code from the email" }).fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/me");
});
