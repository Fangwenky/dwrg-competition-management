import { expect, test } from "@playwright/test";

test.describe("local account lifecycle", () => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL) && process.env.ALLOW_MUTATING_E2E !== "1", "deployed smoke tests must not mutate production data");

  test("a visitor can register, use the workspace, log out, and log back in", async ({ page }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W/g, "").slice(0, 6)}_${Date.now().toString().slice(-8)}`;
    const username = `qa_${suffix}`.slice(0, 24);
    const password = "Regression_2026!";

    await page.goto("/register");
    await page.getByLabel("用户名").fill(username);
    await page.getByLabel("显示名称").fill("自动化回归用户");
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByLabel("确认密码").fill(password);
    await page.getByRole("button", { name: "创建账号" }).click();

    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole("heading", { level: 1, name: "个人赛事工作台" })).toBeVisible();
    await expect(page.getByText(`@${username}`)).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);

    await page.getByRole("button", { name: "退出登录" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/login");
    await page.getByLabel("用户名").fill(username);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "进入赛事中枢" }).click();
    await expect(page).toHaveURL(/\/me$/);
  });

  test("registration and login errors are announced accessibly", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("用户名").fill("qa_validation");
    await page.getByLabel("显示名称").fill("验证用户");
    await page.getByLabel("密码", { exact: true }).fill("Regression_2026!");
    await page.getByLabel("确认密码").fill("Different_2026!");
    await page.getByRole("button", { name: "创建账号" }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText("两次输入的密码不一致");

    await page.goto("/login");
    await page.getByLabel("用户名").fill("qa_user_does_not_exist");
    await page.getByLabel("密码").fill("WrongPassword_2026!");
    await page.getByRole("button", { name: "进入赛事中枢" }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText("用户名或密码不正确");
  });
});
