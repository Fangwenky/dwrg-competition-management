import { expect, test } from "@playwright/test";
import { loginBootstrapAdmin } from "./helpers";

const mutatingExternalRun = Boolean(process.env.PLAYWRIGHT_BASE_URL) && process.env.ALLOW_MUTATING_E2E === "1";
test.describe("isolated core competition workflow", () => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL) && !mutatingExternalRun, "deployed smoke tests must not mutate production data");

  test("event, approval, stage, match result, and public archive work end to end", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "the destructive business workflow runs once; mobile coverage is provided by smoke and account tests");
    test.setTimeout(120_000);

    const suffix = `${Date.now().toString().slice(-9)}-${Math.random().toString(36).slice(2, 6)}`;
    const eventName = `自动化核心回归 ${suffix}`;
    const eventSlug = `qa-core-${suffix}`;
    const stageName = `资格阶段 ${suffix}`;
    const username = `qa_flow_${suffix.replace(/\W/g, "").slice(-12)}`.slice(0, 24);
    const userPassword = "Regression_2026!";
    const resultStageName = `赛果阶段 ${suffix}`;
    const matchName = `自动化赛果 ${suffix}`;

    const adminContext = await browser.newContext();
    const userContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const userPage = await userContext.newPage();

    try {
      await loginBootstrapAdmin(adminPage);

      await adminPage.goto("/admin/events");
      await expect(adminPage.getByRole("heading", { name: "赛事档案索引" })).toBeVisible();
      await adminPage.getByText("创建新赛事", { exact: true }).click();
      await adminPage.locator('input[name="mode"][value="ADMIN_TEAMS"]').check({ force: true });
      await adminPage.getByLabel("赛事名称").fill(eventName);
      await adminPage.getByLabel("网址标识").fill(eventSlug);
      await adminPage.getByLabel("一句话说明").fill("用于持续验证赛事管理核心业务链");
      await adminPage.getByLabel("赛事介绍").fill("该赛事仅存在于自动销毁的 QA 数据库，用于回归身份审核和赛事编排。\n");
      await adminPage.getByRole("button", { name: "创建并开放报名" }).click();
      await expect(adminPage.locator('form [role="status"]')).toHaveText("赛事已创建");

      await adminPage.getByLabel("搜索赛事").fill(eventSlug);
      await adminPage.getByRole("button", { name: "筛选" }).click();
      const eventCard = adminPage.locator("article").filter({ hasText: eventName });
      await expect(eventCard).toBeVisible();
      const eventOpsHref = await eventCard.getByRole("link", { name: "进入工作台" }).getAttribute("href");
      expect(eventOpsHref).toMatch(/^\/ops\/[0-9a-f-]+$/);
      const eventId = eventOpsHref!.split("/").at(-1)!;

      await adminPage.goto(`/events/${eventSlug}`);
      await expect(adminPage.getByRole("heading", { level: 1 })).toContainText(eventName);

      await adminPage.goto(`${eventOpsHref}/workflow`);
      await adminPage.getByLabel("阶段名称").fill(stageName);
      await adminPage.getByLabel("阶段类型").selectOption("MANUAL");
      await adminPage.getByLabel("晋级数").fill("1");
      await adminPage.getByRole("button", { name: "添加阶段" }).click();
      await expect(adminPage.getByRole("status")).toHaveText("阶段已添加");
      await expect(adminPage.getByRole("heading", { name: stageName })).toBeVisible();

      await userPage.goto("/register");
      await userPage.getByLabel("用户名").fill(username);
      await userPage.getByLabel("显示名称").fill("核心流程回归用户");
      await userPage.getByLabel("密码", { exact: true }).fill(userPassword);
      await userPage.getByLabel("确认密码").fill(userPassword);
      await userPage.getByRole("button", { name: "创建账号" }).click();
      await expect(userPage).toHaveURL(/\/me$/);

      await userPage.goto("/admin");
      await expect(userPage).toHaveURL(/\/me\?error=forbidden/);

      await userPage.goto(`/me/applications?event=${eventId}&role=COMMENTATOR`);
      await expect(userPage.getByText(`当前赛事：${eventName}`)).toBeVisible();
      await userPage.getByLabel("解说经历").fill("自动化测试：完整赛事解说与复盘经历");
      await userPage.getByLabel("作品链接").fill("https://example.com/qa-commentary");
      await userPage.getByRole("button", { name: "申请成为解说" }).click();
      await expect(userPage.locator('form [role="status"]')).toHaveText("申请已提交");

      await adminPage.goto(`${eventOpsHref}/applications`);
      const applicationCard = adminPage.locator("article").filter({ hasText: `@${username}` });
      await expect(applicationCard).toContainText("解说");
      await applicationCard.getByRole("button", { name: "通过申请" }).click();
      await expect(adminPage.getByRole("status")).toHaveText("身份申请已通过。");

      await userPage.reload();
      await expect(userPage.getByText("身份已生效")).toBeVisible();

      await adminPage.goto("/admin/events?q=manor-invitational-2026");
      const seededEventCard = adminPage.locator("article").filter({ hasText: "DWRG 庄园邀请赛" });
      const seededOpsHref = await seededEventCard.getByRole("link", { name: "进入工作台" }).getAttribute("href");
      expect(seededOpsHref).toMatch(/^\/ops\/[0-9a-f-]+$/);

      await adminPage.goto(`${seededOpsHref}/workflow`);
      await adminPage.getByLabel("阶段名称").fill(resultStageName);
      await adminPage.getByLabel("阶段类型").selectOption("MANUAL");
      await adminPage.getByLabel("晋级数").fill("1");
      await adminPage.getByRole("button", { name: "添加阶段" }).click();
      await expect(adminPage.getByRole("status")).toHaveText("阶段已添加");
      const manualStage = adminPage.locator("article").filter({ hasText: resultStageName });
      await manualStage.getByLabel("A 方战队").selectOption({ index: 1 });
      await manualStage.getByLabel("B 方战队").selectOption({ index: 2 });
      await manualStage.getByLabel("轮次 / 比赛名称").fill(matchName);
      await manualStage.getByLabel("局数").selectOption("1");
      await manualStage.getByRole("button", { name: "添加手动比赛" }).click();
      await expect(manualStage.getByRole("status")).toHaveText("手动比赛已创建并通知双方队员");

      await adminPage.goto(`${seededOpsHref}/matches`);
      const matchCard = adminPage.locator("article").filter({ hasText: matchName });
      const resultHref = await matchCard.getByRole("link", { name: "录入 / 查看结果" }).getAttribute("href");
      expect(resultHref).toMatch(/^\/ops\/[0-9a-f-]+\/matches\/[0-9a-f-]+$/);
      const matchId = resultHref!.split("/").at(-1)!;
      await adminPage.goto(resultHref!);

      await adminPage.getByLabel("比赛地图").selectOption({ index: 1 });
      await adminPage.getByLabel("上半场逃脱人数").fill("4");
      await adminPage.getByLabel("下半场逃脱人数").fill("0");
      for (const half of [1, 2]) {
        for (let slot = 1; slot <= 4; slot += 1) {
          await adminPage.locator(`select[name="survivor_${half}_1_${slot}"]`).selectOption({ index: slot });
          await adminPage.locator(`select[name="survivor_char_${half}_1_${slot}"]`).selectOption({ index: slot });
        }
        await adminPage.locator(`select[name="hunter_${half}_1"]`).selectOption({ index: 5 });
        await adminPage.locator(`select[name="hunter_char_${half}_1"]`).selectOption({ index: 1 });
      }
      await expect(adminPage.getByLabel("第 1 局积分预览")).toContainText("10 : 0");
      const duplicate = await adminPage.locator('select[name="survivor_1_1_1"]').inputValue();
      await adminPage.locator('select[name="survivor_1_1_2"]').selectOption(duplicate);
      await adminPage.getByRole("button", { name: "保存结果草稿" }).click();
      await expect(adminPage.locator('form [role="alert"]')).toBeVisible();
      await expect(adminPage.getByLabel("比赛地图")).not.toHaveValue("");
      await expect(adminPage.locator('select[name="survivor_1_1_1"]')).toHaveValue(duplicate);
      await adminPage.locator('select[name="survivor_1_1_2"]').selectOption({ index: 2 });
      await adminPage.getByRole("button", { name: "保存结果草稿" }).click();
      await expect(adminPage.locator('form [role="status"]')).toHaveText("比赛结果已保存为草稿");

      await adminPage.reload();
      await expect(adminPage.getByRole("button", { name: "确认并发布结果" })).toBeVisible();
      adminPage.once("dialog", (dialog) => dialog.accept());
      await adminPage.getByRole("button", { name: "确认并发布结果" }).click();
      await expect(adminPage.locator('p[role="status"]')).toHaveText("比赛结果已发布到公开档案");

      await adminPage.goto(`/matches/${matchId}`);
      await expect(adminPage.getByRole("heading", { level: 1, name: "比赛档案" })).toBeVisible();
      await expect(adminPage.getByText(matchName, { exact: true }).first()).toBeVisible();
      await expect(adminPage.getByText(/^1\s*:\s*0$/).first()).toBeVisible();

      await adminPage.goto("/events/manor-invitational-2026/schedule");
      await expect(adminPage.getByText(matchName, { exact: true }).first()).toBeVisible();
    } finally {
      await Promise.all([adminContext.close(), userContext.close()]);
    }
  });
});
