# DWRG 恢复流程

1. 停止应用但保留数据库：`docker-compose stop app`。
2. 恢复数据库：`docker-compose exec -T db pg_restore -U dwrg -d dwrg --clean --if-exists < /opt/dwrg/backups/<时间>/database.dump`。
3. 解压上传：`tar -C /opt/dwrg/data -xzf /opt/dwrg/backups/<时间>/uploads.tar.gz`。
4. 启动应用并检查：`docker-compose up -d app && curl -fsS http://127.0.0.1:3300/api/health`。
