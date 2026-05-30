/**
 * Current organization context.
 *
 * `getCurrentOrgId()` is called from many non-React places (hooks, async
 * importers, lib helpers) where calling `useAuth()` directly isn't an
 * option. To bridge that, `AuthContextProvider` publishes the resolved
 * org id into this module via `setCurrentOrgId()` whenever the session /
 * membership changes; the synchronous getter reads from that cache.
 *
 * If nothing has published an org id yet, the getter throws — callers
 * that need an org id must be inside a signed-in session under
 * `<AuthContextProvider>`.
 */

const CURRENT_ORG_STORAGE_KEY = "rcm.current-org-id";

let _currentOrgId: string | null = null;
let _hydratedFromStorage = false;

function readStoredCurrentOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(CURRENT_ORG_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function writeStoredCurrentOrgId(orgId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (orgId) {
      localStorage.setItem(CURRENT_ORG_STORAGE_KEY, orgId);
    } else {
      localStorage.removeItem(CURRENT_ORG_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures (private mode / blocked storage).
  }
}

/** Called by AuthContextProvider whenever the active org changes. */
export function setCurrentOrgId(orgId: string | null): void {
  _currentOrgId = orgId;
  _hydratedFromStorage = true;
  writeStoredCurrentOrgId(orgId);
}

/** Read the cached org id without throwing (returns null if unset). */
export function peekCurrentOrgId(): string | null {
  if (!_hydratedFromStorage && !_currentOrgId) {
    _currentOrgId = readStoredCurrentOrgId();
    _hydratedFromStorage = true;
  }
  return _currentOrgId;
}

/**
 * Synchronous accessor used by hooks/lib helpers when inserting or
 * filtering rows by `org_id`. Throws when called before
 * `AuthContextProvider` has resolved a signed-in user's org.
 */
export function getCurrentOrgId(): string {
  const orgId = peekCurrentOrgId();
  if (!orgId) {
    throw new Error(
      "getCurrentOrgId() called with no active organization. " +
        "Ensure the caller runs inside <AuthContextProvider> while a user is signed in."
    );
  }
  return orgId;
}
