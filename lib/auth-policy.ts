export function forcedPasswordChangePath(mustChangePassword: boolean, requestPath: string | null | undefined) {
  if (!mustChangePassword) return null;
  const pathname = (requestPath ?? "").split("?")[0];
  return pathname === "/me/security" ? null : "/me/security?required=1";
}

export function loginDestination(mustChangePassword: boolean, requestedPath: string) {
  return mustChangePassword ? "/me/security?required=1" : requestedPath;
}
