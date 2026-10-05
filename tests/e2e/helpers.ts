import { expect, type Page } from "@playwright/test";

const initialAdminPassword = process.env.E2E_ADMIN_INITIAL_PASSWORD ?? "E2E_Admin_2026!";
const changedAdminPassword = process.env.E2E_ADMIN_PASSWORD ?? "E2E_Admin_Changed_2026!";

async function submitLogin(page: Page, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "进入赛事中枢" }).click();
  await Promise.race([
    page.waitForURL((url) => url.pathname !== "/login", { timeout: 15_000 }),
    page.locator('form [role="alert"]').waitFor({ state: "visible", timeout: 15_000 })
  ]);
}

export async function loginBootstrapAdmin(page: Page) {
  await submitLogin(page, initialAdminPassword);

  if (await page.locator('form [role="alert"]').isVisible()) {
    await submitLogin(page, changedAdminPassword);
  }

  if (/\/me\/security/.test(page.url())) {
    await page.getByLabel("当前密码").fill(initialAdminPassword);
    await page.getByLabel("新密码", { exact: true }).fill(changedAdminPassword);
    await page.getByLabel("确认新密码").fill(changedAdminPassword);
    await page.getByRole("button", { name: "更新密码并退出其他会话" }).click();
    await expect(page).toHaveURL(/\/login\?changed=1/, { timeout: 15_000 });
    await submitLogin(page, changedAdminPassword);
  }

  await expect(page).toHaveURL(/\/me$/, { timeout: 15_000 });
}

