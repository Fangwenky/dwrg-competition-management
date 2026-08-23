import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sqlClient } from "../lib/db";

async function main() {
  const [teamRoleType] = await sqlClient<{ exists: boolean }[]>`select to_regtype('public.team_member_role') is not null as exists`;
  if (teamRoleType?.exists) {
    // PostgreSQL requires a newly-added enum value to be committed before an index can reference it.
    await sqlClient.unsafe(`ALTER TYPE "public"."team_member_role" ADD VALUE IF NOT EXISTS 'VICE_CAPTAIN' BEFORE 'MEMBER'`);
  }
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Database migrations applied.");
  await sqlClient.end();
}

main().catch(async (error) => {
  console.error(error);
  await sqlClient.end();
  process.exit(1);
});
