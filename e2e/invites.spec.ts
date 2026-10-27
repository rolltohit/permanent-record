import { type Browser, expect, type Page, test } from "@playwright/test";
import { clearMail, latestSignInEmail } from "./mail";

// Every test gets fresh addresses, so runs don't collide with each other or old data.
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function signInWithCode(page: Page, email: string, next = "/") {
  await clearMail();
  await page.goto(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
  await page.getByRole("textbox", { name: "Your email" }).fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  const { code } = await latestSignInEmail(email);
  await page.getByRole("textbox", { name: "Code from the email" }).fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Ana (seeded admin) creates an invite in the app and returns its link. */
async function createInvite(browser: Browser, opts: { name?: string; email?: string } = {}): Promise<string> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signInWithCode(page, "ana@example.com", "/admin/invites");
  await expect(page).toHaveURL("/admin/invites");
  if (opts.name) await page.getByRole("textbox", { name: /Their name/ }).fill(opts.name);
  if (opts.email) await page.getByRole("textbox", { name: /Their email/ }).fill(opts.email);
  await page.getByRole("button", { name: "Create invite" }).click();
  await expect(page.getByText(/Invite ready/)).toBeVisible();
  const link = await page.getByRole("textbox", { name: "Invite link" }).inputValue();
  await ctx.close();
  return link;
}

test("a friend joins from an invite link with an email code", async ({ browser, page }) => {
  const id = unique();
  const link = await createInvite(browser, { name: `Dana${id}` });

  await clearMail();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: `Hi Dana${id}! Ana invited you to Rec Room` })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your name" })).toHaveValue(`Dana${id}`);
  const email = `dana${id}@example.com`;
  await page.getByRole("textbox", { name: "Your email" }).fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText(`We emailed a code to ${email}`)).toBeVisible();

  // Leaving and coming back (e.g. to check email on a phone) keeps your place.
  await page.reload();
  await expect(page.getByText(`We emailed a code to ${email}`)).toBeVisible();

  const mail = await latestSignInEmail(email);
  expect(mail.subject).toBe("Your Rec Room code");
  await page.getByRole("textbox", { name: "Code from the email" }).fill("000000");
  await page.getByRole("button", { name: "Join Rec Room" }).click();
  await expect(page.getByText("That code didn't work")).toBeVisible();

  await page.getByRole("textbox", { name: "Code from the email" }).fill(` ${mail.code.slice(0, 3)} ${mail.code.slice(3)} `);
  await page.getByRole("button", { name: "Join Rec Room" }).click();
  await expect(page.getByText(`Welcome to Rec Room, Dana${id}!`)).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();

  // The link is now used up, and says so kindly to anyone else.
  const other = await browser.newPage();
  await other.goto(link);
  await expect(other.getByRole("heading", { name: "This invite was already used" })).toBeVisible();
  await expect(other.getByText("Ana")).toBeVisible();
  await other.close();
});

test("the email's button works in a different browser from the one that asked", async ({ browser, page }) => {
  const id = unique();
  const link = await createInvite(browser);
  const email = `eli${id}@example.com`;

  await clearMail();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Ana invited you to Rec Room" })).toBeVisible();
  await page.getByRole("textbox", { name: "Your name" }).fill(`Eli${id}`);
  await page.getByRole("textbox", { name: "Your email" }).fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  const mail = await latestSignInEmail(email);

  // e.g. the link opens inside the Gmail app, or on another device.
  const elsewhere = await browser.newContext();
  const phone = await elsewhere.newPage();
  await phone.goto(mail.link);
  await expect(phone.getByText(`Welcome to Rec Room, Eli${id}!`)).toBeVisible();

  // Opening it a second time (mail scanners do this) still lands you in the app.
  await phone.goto(mail.link);
  await expect(phone).toHaveURL("/");
  await elsewhere.close();
});

test("a friend invited by email can just sign in from the login page", async ({ browser, page }) => {
  const id = unique();
  const email = `fay${id}@example.com`;
  await createInvite(browser, { name: `Fay${id}`, email });

  await signInWithCode(page, email);
  await expect(page.getByText(`Welcome to Rec Room, Fay${id}!`)).toBeVisible();
});

test("someone without an invite gets a clear answer, not an error", async ({ page }) => {
  await clearMail();
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Your email" }).fill(`nobody${unique()}@example.com`);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText("There's no Rec Room account for that email yet")).toBeVisible();

  await page.getByText("New here?").click();
  await page.getByRole("textbox", { name: /invite link/ }).fill("not a link");
  await page.getByRole("button", { name: "Use this invite" }).click();
  await expect(page.getByText("doesn't look like a Rec Room invite link")).toBeVisible();

  await page.goto("/invite/doesnotexist");
  await expect(page.getByRole("heading", { name: "We can't find that invite" })).toBeVisible();
});

test("signed in but not a member: an invite for your email appears on /welcome", async ({ browser, page }) => {
  // Reproduces the first real friend's situation: they signed in, but joining
  // never finished and their invite later expired.
  const id = unique();
  const email = `gus${id}@example.com`;
  const firstLink = await createInvite(browser, { email: `someone-else${id}@example.com` });

  await clearMail();
  await page.goto(firstLink);
  await page.getByRole("textbox", { name: "Your email" }).fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  const mail = await latestSignInEmail(email);
  // Ana revokes that invite before Gus finishes.
  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await signInWithCode(adminPage, "ana@example.com", "/admin/invites");
  await adminPage.locator("li", { hasText: `someone-else${id}@example.com` }).getByRole("button", { name: "Revoke" }).click();
  await expect(adminPage.getByText(`someone-else${id}@example.com`)).toHaveCount(0);

  await page.getByRole("textbox", { name: "Code from the email" }).fill(mail.code);
  await page.getByRole("button", { name: "Join Rec Room" }).click();
  await expect(page.getByRole("heading", { name: "We can't find that invite" })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL("/welcome");
  await expect(page.getByRole("heading", { name: "Almost there" })).toBeVisible();

  // Ana invites Gus's address; reloading /welcome offers it straight away.
  await adminPage.getByRole("textbox", { name: /Their email/ }).fill(email);
  await adminPage.getByRole("button", { name: "Create invite" }).click();
  await expect(adminPage.getByText(/Invite ready/)).toBeVisible();
  await admin.close();

  await page.reload();
  await expect(page.getByRole("heading", { name: "You're invited!" })).toBeVisible();
  await page.getByRole("textbox", { name: "What should friends call you?" }).fill(`Gus${id}`);
  await page.getByRole("button", { name: "Join Rec Room" }).click();
  await expect(page.getByText(`Welcome to Rec Room, Gus${id}!`)).toBeVisible();
});
