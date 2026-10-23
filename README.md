# DWRG 庄园联赛

第五人格社区赛事报名、身份审核、临时战队、赛程编排、BP 与赛果归档平台。

完整测试分层、QA 环境与发布回归流程见 [TESTING.md](./TESTING.md)。

## 本地开发

使用 Node.js 24 LTS 和 pnpm 10.15.0；生产镜像使用相同的 Node.js 版本系列。

```bash
cp .env.example .env
pnpm install --frozen-lockfile
# 修改 .env 中的 POSTGRES_PASSWORD、DATABASE_URL 密码和管理员密码后：
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev
```

数据库迁移位于 `drizzle/`。迁移和种子命令会自动读取 `.env`，已导出的环境变量优先。本地数据库只监听 `127.0.0.1:5433`，开发数据保存在 `.local-data/`。首次种子会创建管理员、基础地图/角色以及一项可公开浏览的演示赛事。

## 验证

```bash
# 规则级单元测试
pnpm test

# Lint、类型、覆盖率门槛、生产构建
pnpm test:quality

# 自动启动隔离 PostgreSQL，执行迁移、种子和浏览器端到端测试
pnpm test:e2e

# 提交前完整回归
pnpm test:all
```

首次执行浏览器测试前安装 Chromium：

```bash
pnpm exec playwright install chromium
```

线上冒烟测试只读，不创建账号或修改数据：

```bash
PLAYWRIGHT_BASE_URL=https://dwrg.fangwenky.dpdns.org pnpm test:smoke
```

失败时的截图、视频与追踪文件位于 `test-results/`，HTML 报告位于
`playwright-report/`。端到端测试使用 `docker-compose.test.yml` 的临时数据库，
不会连接开发或生产数据库。

服务器上需要验证容器化产物时，可在独立项目名下启动完整 QA 栈；它只监听
`127.0.0.1:3310`，数据库与上传目录均为临时存储：

```bash
docker compose -p dwrg-qa -f docker-compose.qa.yml up -d --build --wait
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3310 ALLOW_MUTATING_E2E=1 pnpm exec playwright test
docker compose -p dwrg-qa -f docker-compose.qa.yml down --volumes
```

## 生产部署

生产目录为 `/opt/dwrg/source`，数据存放在 `/opt/dwrg/data`。复制 `.env.example` 为 `.env`，设置随机的 PostgreSQL 密码与管理员密码，并把 `DWRG_DATA_DIR` 改为 `/opt/dwrg/data`、`APP_URL` 改为 `https://dwrg.fangwenky.dpdns.org`。PostgreSQL 密码建议使用随机十六进制字符串，以便直接用于连接串。生产容器使用 Compose 注入的数据库连接串，无需会话签名密钥。然后运行：

```bash
docker-compose up -d --build
curl -fsS http://127.0.0.1:3300/api/health
```

将 `deploy/nginx-dwrg.conf` 安装为独立站点，验证配置后使用 Certbot 为 `dwrg.fangwenky.dpdns.org` 签发证书。`deploy/backup.sh` 应通过 root 的 cron 每日执行。会话使用数据库持久化的 256 位随机不透明令牌，服务端只保存 SHA-256 摘要，因此不需要额外的会话签名密钥。

当前未启用 GitHub Actions。发布前先执行 `pnpm test:all`，将验证通过的提交推送到
`main`，再将该提交的源码（不含 `.env`、`.git`）上传到 VPS 的
`/opt/dwrg/incoming/<完整提交号>/`，执行 `/usr/local/sbin/dwrg-deploy <完整提交号>`。
该脚本执行部署前备份、镜像构建、服务替换和健康检查；部署失败会恢复上一份源码及镜像。
生产数据库密码和管理员密码只保留在 VPS 的 `/opt/dwrg/source/.env`，不会进入 GitHub。

## 核心规则

- 全局管理员可以创建赛事和授予赛事管理员；赛事管理员仅管理被授权赛事。
- 选手、裁判、解说按赛事申请；禁止自审、裁判执裁本人战队、同场兼任解说与裁判。
- 战队是赛事内临时组织，一个选手在同赛事只能加入一支战队。
- 比赛结果先保存草稿，再由无利益冲突的赛事管理员或全局管理员发布。
- 不记录天赋、出生点、时长和密码机进度；无法自动解开的同分必须填写人工裁定说明。
