/**
 * Lets the navbar tell the mounted home page to leave search mode.
 * HomeContent assigns the implementation on every render so it cannot go stale.
 */

type HomeFeedNavApi = {
  /** Clears the search box and returns true if a query was active. */
  exitSearchMode: () => boolean
}

const api: HomeFeedNavApi = {
  exitSearchMode: () => false,
}

export function registerHomeFeedNav(next: HomeFeedNavApi) {
  api.exitSearchMode = next.exitSearchMode
}

export function unregisterHomeFeedNav() {
  api.exitSearchMode = () => false
}

export function exitHomeSearchMode(): boolean {
  return api.exitSearchMode()
}
