export const LOGIN_WINDOW_MS = 15 * 60_000;
export const LOGIN_BLOCK_MS = 15 * 60_000;
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_IP_MAX_FAILURES = 20;

export function nextLoginLimitState(input: {
  failedCount: number;
  windowStartedAt: Date;
  now: Date;
  maxFailures?: number;
}) {
  const withinWindow = input.now.getTime() - input.windowStartedAt.getTime() < LOGIN_WINDOW_MS;
  const failedCount = withinWindow ? input.failedCount + 1 : 1;
  return {
    failedCount,
    windowStartedAt: withinWindow ? input.windowStartedAt : input.now,
    blockedUntil: failedCount >= (input.maxFailures ?? LOGIN_MAX_FAILURES) ? new Date(input.now.getTime() + LOGIN_BLOCK_MS) : null
  };
}
