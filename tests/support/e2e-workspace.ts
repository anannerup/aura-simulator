/**
 * The main page on a workspace of its own. Without `?w=` the page follows the shared `default`
 * workspace, which the server keeps across tests and runs: a spell picked or code pushed in one test
 * would show up in the next (and live, over SSE, in tests running in parallel).
 */
export function ownWorkspacePage(prefix: string): string {
  return `/?w=${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
