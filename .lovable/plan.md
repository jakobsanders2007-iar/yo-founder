# Code Tab Premium Rebuild

Rebuild the Code tab inside `src/routes/workspaces.$id.tsx` into a full-screen execution layer with 4 sub-tabs, a top status bar, sticky prompt input, and approval flow. Vercel preview URL is the live preview — no local dev server.

## 1. Database additions

Migration adds 4 columns to `prompts`:
- `summary text` — plain English what changed
- `files_affected text[]` — list of file paths
- `next_steps text[]` — 1-3 suggested next steps
- `vercel_preview_url text` — iframe src

No new tables. RLS already covers the row; new columns inherit.

## 2. Server function additions (`src/lib/integrations.functions.ts`)

All GitHub/Vercel calls stay server-side, reading tokens from `profiles` / `workspaces`. New server functions:

- `getRepoTree({ workspaceId })` — `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`. Returns `[{ path, type, sha }]` for the Files tab.
- `getRepoFile({ workspaceId, path })` — `GET /repos/{owner}/{repo}/contents/{path}`. Returns `{ path, content, size, lines }`.
- `getPrDiff({ workspaceId, prNumber })` — `GET /repos/{owner}/{repo}/pulls/{n}/files`. Returns `[{ filename, status, additions, deletions, patch }]` for the Diff tab.
- `mergePr({ workspaceId, promptId, prNumber })` — `PUT /repos/{owner}/{repo}/pulls/{n}/merge`. On success updates `prompts.status='deployed'` and fires `fetchVercelPreview`.
- `closePr({ workspaceId, promptId, prNumber })` — `PATCH .../pulls/{n}` with `state: closed`, resets prompt status to `draft`.
- `fetchVercelPreview({ workspaceId, promptId })` — `GET https://api.vercel.com/v6/deployments?projectId=...&limit=1` using `vercel_token` from workspace; saves `vercel_preview_url` on the prompt row.

Extend `generateClaudeCodePrompt` (in `yofounder.functions.ts`) to instruct the model to also return `summary`, `files_affected`, `next_steps` and persist them on the row.

## 3. UI rebuild (in same `workspaces.$id.tsx`)

Replace `CodeTab` body. New layout:

```text
┌──────────────────────────────────────────────────────┐
│ repo · branch · [status badge]      [Push to GitHub] │  top bar
├──────────────────────────────────────────────────────┤
│ Preview | Diff | Files | Logs                        │  sub-tabs
├──────────────────────────────────────────────────────┤
│                                                      │
│              active sub-tab content                  │
│                                                      │
│ ─────────────── change summary card (if job done) ── │
│ ─────────────── approval card (if pr_opened) ─────── │
├──────────────────────────────────────────────────────┤
│ [textarea] [context chips]              [Run]        │  sticky bottom
└──────────────────────────────────────────────────────┘
```

Sub-components (all inline in same file to keep diff focused — extract later if file >1100 lines):

- `<CodeTopBar />` — repo, branch, `<BuildStatusBadge />`, "Push to GitHub" (enabled when `selected.status === 'pr_opened'`).
- `<BuildStatusBadge status />` — 8 states with icon + label + amber pulse on active.
- `<SubTabBar />` — Preview/Diff/Files/Logs with amber underline on active, scrollable on mobile.
- `<PreviewPane url />` — empty state (grid bg, logo, amber CTA) → focuses prompt input; otherwise iframe with refresh / open / copy bar; skeleton on load; fallback message after 5s.
- `<DiffPane prompt />` — fetches `getPrDiff` when `pr_number` exists. Left list 30%, right unified diff 70%, IBM Plex Mono, +/- coloring. Empty state when no PR.
- `<FilesPane workspaceId />` — fetches `getRepoTree`, lazy-renders folders; selected file fetched via `getRepoFile`. "Add to prompt context" pushes path into `contextFiles` state.
- `<LogsPane job />` — derives log lines from job status/error history with timestamps; "Fix with AI" button on red lines pre-fills + focuses prompt.
- `<ChangeSummaryCard prompt />` — amber left border, files_affected list, summary, next_steps.
- `<ApprovalCard prompt />` — three buttons: Approve&Push (calls `mergePr`, confetti via `canvas-confetti`), Request Changes (pre-fills prompt), Reject (confirm → `closePr`).
- `<PromptDock />` — sticky textarea + chips + Run + char count + Cmd+Enter; disabled with "working..." while running.
- `<EmptyState />` — full-screen when `prompts.length === 0`.

Existing functionality preserved: prompt list still backs the view (rename "New change" stays); existing `runClaudeCode` server fn still triggers the job; realtime subscriptions for `prompts` and `claude_code_jobs` unchanged.

## 4. Status mapping

8 visual states derive from `job.status` + `prompt.status`:
- no job → Waiting
- `queued|reading` → Thinking
- `coding` → Building
- `committing` → Saving
- `pr_opened` → Reviewing
- `merging` (transient) → Approved
- `deployed` → Live
- `failed` → Error

## 5. Confetti + deps

Add `canvas-confetti` (~5kb) for the approve animation. No other new deps — diffs rendered with custom component (no react-diff-viewer needed for unified view).

## 6. Mobile

- Sub-tabs become horizontally scrollable strip with `overflow-x-auto`
- Diff/Files panes stack vertically (`flex-col md:flex-row`)
- Prompt dock stays sticky at bottom

## 7. What stays untouched

- `__root.tsx`, login, settings, onboarding, other tabs (Chat / GitHub / Vercel / Supabase / Domain)
- `runClaudeCode` server fn signature
- All other existing server functions
- Plain-English copy rules continue to apply throughout (no "repo/PR/merge/branch" in user-facing strings — internal labels say "version" / "change request" / "approve")

## Order of execution

1. Migration (prompts columns) — wait for approval
2. Server fns in `integrations.functions.ts` + small extension to `yofounder.functions.ts`
3. Install `canvas-confetti`
4. Rewrite `CodeTab` + sub-components in `workspaces.$id.tsx`
5. Smoke-test build, fix typecheck errors

After approval I'll start with the migration.
