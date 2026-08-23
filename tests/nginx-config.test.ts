import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = readFileSync(new URL("../deploy/nginx-dwrg.conf", import.meta.url), "utf8");

describe("production nginx authentication throttling", () => {
  it("does not count GET page loads or Next.js prefetches", () => {
    expect(config).toMatch(/map\s+\$request_method\s+\$dwrg_auth_limit_key\s*{[\s\S]*POST\s+\$binary_remote_addr;/);
    expect(config).toContain("limit_req_zone $dwrg_auth_limit_key zone=dwrg_auth_post:10m");
  });

  it("returns a semantic status when an authentication submission is throttled", () => {
    expect(config).toMatch(/location\s+~\s+\^\/\(login\|register\)\$\s*{[\s\S]*limit_req_status 429;/);
  });
});
