export type MatchStaffRole = "REFEREE" | "COMMENTATOR";
export type MatchStaffAssignmentIssue = "SAME_ASSIGNMENT" | "CROSS_ROLE";

export function matchStaffAssignmentError(input: {
  role: MatchStaffRole;
  sameUserRole?: MatchStaffRole | null;
  hasReferee?: boolean;
}): MatchStaffAssignmentIssue | null {
  if (input.sameUserRole === input.role) return "SAME_ASSIGNMENT";
  if (input.sameUserRole) return "CROSS_ROLE";
  return null;
}
