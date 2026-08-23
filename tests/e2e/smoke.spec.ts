import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/events", "/login", "/register"];

test.describe("@smoke public application", () => {
  test("health endpoint reports a live database", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", service: "dwrg" });
  });

  test("core pages render without server or browser errors", async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));

    for (const route of publicRoutes) {
      const response = await page.goto(route);
      expect(response?.status(), `${route} should not fail`).toBeLessThan(400);
      await expect(page.locator("main#main")).toBeVisible();
    }

    expect(browserErrors).toEqual([]);
  });

  test("homepage navigation and responsive layout remain usable", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("档案已经苏醒");
    await page.getByRole("link", { name: "赛事档案" }).first().click();
    await expect(page).toHaveURL(/\/events$/);
    await expect(page.getByRole("heading", { level: 1, name: "赛事档案" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("public pages have no serious accessibility violations", async ({ page }) => {
    for (const route of publicRoutes) {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      const serious = results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
      expect(serious, `${route}: ${serious.map((item) => `${item.id} (${item.nodes.length})`).join(", ")}`).toEqual([]);
    }
  });

  test("repeated auth page reads are never mistaken for login attempts", async ({ request }) => {
    for (let index = 0; index < 20; index += 1) {
      const route = index % 2 === 0 ? "/login" : "/register";
      const response = await request.get(route, { failOnStatusCode: false });
      expect(response.status(), `${route} read ${index + 1} was throttled`).toBe(200);
    }
  });

  test("protected workspaces redirect anonymous visitors to login", async ({ page }) => {
    await page.goto("/me");
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});
