/**
 * Builds the login redirect URL, preserving any Prolific URL params
 * so they flow through to the login page for auto-submission.
 */
export function buildLoginRedirect(returnPath: string): string {
  const params = new URLSearchParams({ redirect: returnPath })
  if (typeof window !== "undefined") {
    const sp = new URLSearchParams(window.location.search)
    for (const key of ["PROLIFIC_PID", "STUDY_ID", "SESSION_ID"]) {
      const val = sp.get(key)
      if (val) params.set(key, val)
    }
  }
  return `/login?${params.toString()}`
}
