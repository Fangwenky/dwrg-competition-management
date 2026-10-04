# 测试与回归手册

## 测试分层

| 层级 | 命令 | 覆盖范围 | 是否写数据 |
|---|---|---|---|
| 静态质量 | `pnpm lint && pnpm typecheck` | ESLint、TypeScript、测试配置 | 否 |
| 规则单元测试 | `pnpm test:coverage` | 权限、赛制、积分、工作流、限流配置；带覆盖率门槛 | 否 |
| 生产构建 | `pnpm build` | Next.js 编译、页面数据收集、standalone 产物 | 否 |
| 数据库事务回归 | `pnpm test:e2e` 内自动执行 | 并发晋级、草稿更新与阶段完成；真实 PostgreSQL 事务 | 仅写临时数据库 |
| 本地端到端 | `pnpm test:e2e` | 迁移、种子、注册登录、权限、赛事创建、身份审批、阶段编排、排赛、结构化赛果发布、桌面/移动端、无障碍 | 仅写临时数据库 |
| 线上冒烟 | `PLAYWRIGHT_BASE_URL=https://dwrg.fangwenky.dpdns.org pnpm test:smoke` | 健康检查、公开页面、响应式、无障碍、认证页限流 | 否 |

`pnpm test:all` 是提交或部署前的总入口。GitHub Actions 会在每次 push 和
pull request 上执行质量门禁和隔离端到端测试，并在失败时上传截图、视频和 trace。

## 本地端到端环境

本地全量测试要求 Docker 和 Playwright Chromium：

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
```

脚本会使用固定项目名 `dwrg-e2e` 启动 `docker-compose.test.yml` 中的临时
PostgreSQL，执行迁移和种子，启动 `127.0.0.1:3310` 的开发服务器，最后无论
成功或失败都会删除测试容器及临时数据。它不会读取 `.env` 中的生产连接串。

核心业务链测试会自动完成管理员首次密码修改，并使用唯一名称创建赛事、账号、
阶段和比赛；因此同一 QA 数据库可以重复运行，也能在 Playwright 重试时继续执行。
它还会使用种子中的两支五人战队录入一场 BO1 的地图、双方阵容与角色，发布后再从
公开比赛档案和赛程页核验。单独调试这条链路可运行：

```bash
pnpm test:e2e -- tests/e2e/core-workflow.spec.ts --project=chromium --workers=1
```

## 容器产物 QA

`docker-compose.qa.yml` 用于低内存服务器上的发布前验证。应用只绑定本机回环
地址，数据库和上传目录使用 tmpfs：

```bash
docker compose -p dwrg-qa -f docker-compose.qa.yml up -d --build --wait
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3310 ALLOW_MUTATING_E2E=1 pnpm exec playwright test
docker compose -p dwrg-qa -f docker-compose.qa.yml down --volumes
```

若 Docker 版本只有旧式 Compose，请把 `docker compose` 替换为
`docker-compose`，并用 `/api/health` 轮询代替 `--wait`。

外部地址上的写入用例默认全部跳过。只有地址明确指向一次性 QA 栈时才能启用：

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3310 \
ALLOW_MUTATING_E2E=1 \
pnpm exec playwright test
```

## 线上冒烟的安全边界

线上冒烟只执行 `@smoke` 测试，不注册账号、不登录、不上传文件、不修改赛事。
其中连续读取 `/login` 与 `/register` 的用例专门防止 Next.js 页面预取被 Nginx
误判为登录尝试。任何写数据的浏览器测试在设置 `PLAYWRIGHT_BASE_URL` 后默认跳过；
只有隔离 QA 环境才允许显式设置 `ALLOW_MUTATING_E2E=1`。

## 失败证据与定位

- `playwright-report/`：可浏览的 HTML 报告。
- `test-results/`：失败截图、WebM 视频和 trace。
- `coverage/index.html`：规则层覆盖率明细。
- `dogfood-output/`：人工探索测试记录。
- 线上 5xx：先查 `/var/log/nginx/error.log`，再查 `docker logs source_app_1`。
- 健康状态：`curl -fsS http://127.0.0.1:3300/api/health`。

## 修改后的推荐流程

1. 编码过程中使用 `pnpm test:watch`。
2. 提交前运行 `pnpm test:all`。
3. 部署前启动 `docker-compose.qa.yml` 验证容器产物。
4. 部署完成后运行线上只读冒烟。
5. 若线上冒烟失败，不继续发布；保留报告并先回滚或修复。
