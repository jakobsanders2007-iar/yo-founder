## Diagnosis

The Vite dev server inside the sandbox is healthy:
- `vite dev` started cleanly on port 8080, no errors in the daemon log.
- `curl http://localhost:8080/` returns HTTP 200 with the fully rendered HTML shell (title, meta, root layout, index route markup).

That means the app is building and SSR-ing correctly. The "Preview has not been built yet…" banner you're seeing is from the Lovable preview iframe layer, not from your code.

## Recommended action (no code changes)

1. Hard-refresh the preview pane (or reopen it) so it re-attaches to the running dev server.
2. If it still shows the banner, click **Rebuild preview** / reacquire the sandbox from the preview UI.
3. If the banner persists after that, it's a transient preview-infra issue on Lovable's side — re-sending any message will trigger a fresh sandbox and clear it.

## What I will NOT change

- No source files. There is no error to fix — build output is clean, route tree generates, root SSR returns 200.
- No `vite.config.ts`, `src/server.ts`, or `__root.tsx` edits — the SSR error-handling stack is already wired and working.

If a hard refresh doesn't clear it, tell me and I'll take a Playwright screenshot of the preview and dig into the preview-layer network calls to see what's actually failing.

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>