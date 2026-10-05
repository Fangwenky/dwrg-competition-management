import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { loginBootstrapAdmin } from "./helpers";

const password = "Regression_2026!";

async function register(page: Page, username: string) {
  await expect(page.getByRole("heading", { name: "建立账号", exact: true })).toBeVisible();
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("显示名称").fill(`体验选手 ${username.slice(-4)}`);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByLabel("确认密码").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
}

async function createEvent(page: Page, suffix: string) {
  await page.goto("/admin/events");
  await page.getByText("创建新赛事", { exact: true }).click();
  await page.getByLabel("赛事名称").fill(`全流程体验 ${suffix}`);
  await page.getByLabel("网址标识").fill(`qa-experience-${suffix}`);
  await page.getByRole("button", { name: "创建并开放报名" }).click();
  await expect(page.locator('form [role="status"]')).toHaveText("赛事已创建");
  await page.getByLabel("搜索赛事").fill(`qa-experience-${suffix}`);
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  const href = await page.locator("article").filter({ hasText: `全流程体验 ${suffix}` }).getByRole("link", { name: "进入工作台" }).getAttribute("href");
  expect(href).toMatch(/^\/ops\/[0-9a-f-]+$/);
  return href!.split("/").at(-1)!;
}

async function approve(page: Page, eventId: string, username: string) {
  await page.goto(`/ops/${eventId}/applications`);
  await page.locator("article").filter({ hasText: `@${username}` }).getByRole("button", { name: "通过申请" }).click();
  await expect(page.getByRole("status")).toHaveText("身份申请已通过。");
}

async function completePlayerProfile(page: Page, username: string) {
  await page.getByRole("link", { name: "前往个人资料" }).click();
  await expect(page.getByRole("link", { name: "返回赛事报名" })).toBeVisible();
  await page.getByLabel("游戏内昵称").fill(username);
  await page.getByLabel("游戏 UID").fill(`12345${Date.now().toString().slice(-6)}`);
  await page.getByLabel("求生者最高段位").selectOption({ index: 1 });
  await page.getByLabel("监管者最高段位").selectOption({ index: 1 });
  const proof = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  await page.locator('input[name="file"]').first().setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: proof });
  await page.getByRole("button", { name: "保存个人竞技资料" }).click();
  await expect(page.locator('form [role="status"]').first()).toContainText("个人竞技资料已保存");
  await page.getByRole("link", { name: "返回赛事报名" }).click();
  await page.getByRole("button", { name: "报名选手" }).click();
  await expect(page.locator('form [role="status"]')).toHaveText("申请已提交");
}

test.describe("isolated full experience", () => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL) && process.env.ALLOW_MUTATING_E2E !== "1", "production runs must not mutate data");
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "the business flow runs once and explicitly checks multiple viewport widths");
    expect(browserName).toBe("chromium");
  });

  test("registration returns to the chosen role, staff avoid player onboarding, and admin navigation stays accessible", async ({ browser }) => {
    test.setTimeout(120_000);
    const adminContext = await browser.newContext();
    const staffContext = await browser.newContext();
    try {
      const admin = await adminContext.newPage();
      const staff = await staffContext.newPage();
      await loginBootstrapAdmin(admin);
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const eventId = await createEvent(admin, suffix);
      const target = `/me/applications?event=${eventId}&role=COMMENTATOR`;
      await staff.goto(target);
      await expect(staff).toHaveURL(/\/login\?next=/);
      await staff.getByRole("link", { name: "建立用户档案" }).click();
      const username = `qa_staff_${Date.now().toString().slice(-8)}`;
      await register(staff, username);
      await expect(staff).toHaveURL(new RegExp(`/me/applications\\?event=${eventId}&role=COMMENTATOR`));
      await expect(staff.getByLabel("申请身份")).toHaveValue("COMMENTATOR");
      await staff.getByLabel("解说经历").fill("社区赛解说与赛后复盘");
      await staff.getByLabel("作品链接").fill("https://example.com/experience");
      await staff.getByRole("button", { name: "申请成为解说" }).click();
      await expect(staff.locator('form [role="status"]')).toHaveText("申请已提交");
      await approve(admin, eventId, username);
      await admin.goto(`/ops/${eventId}/applications?status=APPROVED&role=COMMENTATOR`);
      await expect(admin.locator("article").filter({ hasText: `@${username}` })).toContainText("已通过");
      await staff.goto("/me");
      await expect(staff.locator(".next-action-card")).not.toContainText("完善竞技资料");
      await expect(staff.getByText("仅选手报名需要")).toBeVisible();
      for (const width of [320, 375, 768, 1280]) {
        await admin.setViewportSize({ width, height: 900 });
        await admin.goto("/me");
        await expect(admin.getByRole("link", { name: "全局管理", exact: true })).toBeVisible();
        await expect(admin.locator(".next-action-card")).toContainText("进入赛事管理");
        expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (width < 1024) {
          await admin.getByLabel("个人工作台 · 切换栏目").selectOption("/me/security");
          await expect(admin).toHaveURL(/\/me\/security$/);
          await expect(admin.getByLabel("个人工作台 · 切换栏目")).toHaveValue("/me/security");
        }
      }
      const axe = await new AxeBuilder({ page: staff }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
    } finally {
      await Promise.all([adminContext.close(), staffContext.close()]);
    }
  });

  test("players return from profile setup, create a team, invite a teammate, and receive notifications", async ({ browser }) => {
    test.setTimeout(120_000);
    const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
    try {
      const [admin, captain, member] = await Promise.all(contexts.map((context) => context.newPage()));
      await loginBootstrapAdmin(admin);
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const eventId = await createEvent(admin, suffix);
      const names = [`qa_cap_${Date.now().toString().slice(-8)}`, `qa_mem_${Date.now().toString().slice(-8)}`];
      for (const [index, page] of [captain, member].entries()) {
        await page.goto(`/register?next=${encodeURIComponent(`/me/applications?event=${eventId}&role=PLAYER`)}`);
        await register(page, names[index]);
        await expect(page.getByRole("link", { name: "前往个人资料" })).toBeVisible();
        await completePlayerProfile(page, names[index]);
        await approve(admin, eventId, names[index]);
      }
      await captain.goto("/me/teams");
      const teamName = `体验战队 ${suffix}`;
      await captain.getByLabel("战队名称").fill(teamName);
      await captain.getByLabel("缩写", { exact: true }).fill("EXP");
      await captain.getByRole("button", { name: "提交建队申请" }).click();
      await expect(captain.getByRole("heading", { name: "建队申请正在审核" })).toBeVisible();
      await admin.goto(`/ops/${eventId}/teams`);
      await admin.locator("article").filter({ hasText: teamName }).getByRole("button", { name: "批准并开放招募" }).click();
      await expect(admin.getByRole("status")).toHaveText("战队申请已通过并公开");
      await captain.reload();
      await captain.getByLabel("队员用户名").fill(names[1]);
      await captain.getByRole("button", { name: "发送邀请" }).click();
      await expect(captain.locator('form [role="status"]')).toHaveText("邀请已发送");
      await member.goto("/me/teams");
      await member.getByRole("button", { name: "接受" }).click();
      await expect(member.getByRole("status")).toHaveText(`已加入 ${teamName}`);
      await member.getByRole("link", { name: "查看公开页" }).click();
      await expect(member.getByRole("heading", { level: 1 })).toHaveText(teamName);
      await expect(member.getByText("你已经是本战队成员。")).toBeVisible();
      await captain.goto("/me/notifications");
      await expect(captain.getByRole("heading", { name: "选手已接受战队邀请" })).toBeVisible();
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
