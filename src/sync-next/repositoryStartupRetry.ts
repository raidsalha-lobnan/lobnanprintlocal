/**
 * Booting the repository never writes or replays financial commands.
 * Recoverable failures can be retried with a bounded delay. Inconsistent
 * local state or expired credentials MUST remain fail-closed for manual review.
 */
const needsManualAction = /EXISTING_LOCAL_DATA_REQUIRES_RECONCILIATION|WORKSPACE_MISMATCH|LOCAL_SYNC_NOT_CONFIGURED|SESSION_LOGIN_REQUIRED|SECURE_SYNC_API_MUST_USE_HTTPS|LOCAL_STORAGE_SESSION_CLOSED/;

export const repositoryStartupNeedsManualAction = (error: unknown): boolean =>
  needsManualAction.test(String(error));

export const repositoryStartupRetryDelay = (attempt: number): number =>
  Math.min(30000, 2000 * 2 ** Math.min(4, Math.max(0, Math.floor(attempt))));
