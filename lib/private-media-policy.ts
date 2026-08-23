export function canReadRankProof(input: {
  viewerId: string;
  viewerRole: "USER" | "ADMIN";
  ownerId: string;
  eventId?: string | null;
  hasEventManagerGrant?: boolean;
  hasPlayerApplication?: boolean;
}) {
  if (input.viewerRole === "ADMIN" || input.viewerId === input.ownerId) return true;
  return Boolean(input.eventId && input.hasEventManagerGrant && input.hasPlayerApplication);
}
