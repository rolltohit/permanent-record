import { expect, type Page, test } from "@playwright/test";

const MAILPIT = "http://127.0.0.1:54324";

/** Signs in through the real magic-link flow, reading the email from Mailpit. */
async function signIn(page: Page, email: string) {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(`Check ${email}`)).toBeVisible();

  let link: string | undefined;
  await expect
    .poll(async () => {
      const list = await (await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`)).json();
      if (!list.messages?.length) return false;
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
      link = msg.Text.match(/https?:\/\/\S+verify\S+/)?.[0];
      return Boolean(link);
    })
    .toBe(true);
  await page.goto(link!);
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

test("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/me");
  await expect(page).toHaveURL(/\/login$/);
});
