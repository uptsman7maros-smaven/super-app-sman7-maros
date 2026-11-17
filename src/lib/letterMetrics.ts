export const LETTER_IN_PROGRESS_STATUSES = [
  "submitted",
  "resubmitted",
  "in_review",
  "approved",
  "awaiting_number",
] as const;

const inProgressStatusSet = new Set<string>(LETTER_IN_PROGRESS_STATUSES);

export function isLetterInProgress(status: string | null | undefined) {
  return status !== null && status !== undefined && inProgressStatusSet.has(status);
}
