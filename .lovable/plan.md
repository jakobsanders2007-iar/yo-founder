## What changes

**FIX 4 — Vercel + Supabase tabs**
Already in the right shape. `VercelTab` and `SupabaseTab` already render:
- A signup CTA ("Set up Vercel" / "Set up Supabase") that opens the provider's signup page in a new tab
- A "paste your URL" input + Save button as the fallback
- A connected view once the URL is saved

No code change needed. The previous "build OAuth" plan is dropped. I'll cancel the pending secret request (`VERCEL_CLIENT_ID` etc.) — you can ignore that prompt.

**FIX 3 — GitHub sub-tabs**
Restructure `RepoDashboard` inside `src/components/tabs/GithubTab.tsx` to expose 3 sub-tabs under the existing repo header:

1. **Pull Requests** (default) — current PR list with inline expandable diffs and Approve flow. No behavior change.
2. **Files** — new view that lists the repo's top-level files/folders for the default branch via GitHub's `GET /repos/{owner}/{repo}/contents` (a new `listGithubRepoFiles` server fn in `src/lib/integrations.functions.ts`). Click a folder to drill in, click a file to open it on GitHub. Read-only.
3. **Activity** — recent commits (current "Recent updates" section), promoted out of the collapsed section into a full sub-tab.

The header (repo name, Open on GitHub, Change project, Refresh) stays above the sub-tab bar. The Approve-merge modal stays at the dashboard level.

### Files touched
- `src/components/tabs/GithubTab.tsx` — add sub-tab state + 3 sub-views, move commits out of the inline collapsible
- `src/lib/integrations.functions.ts` — add `listGithubRepoFiles({ workspaceId, path? })`

### Out of scope
- No DB migrations
- No new secrets
- No changes to `VercelTab` / `SupabaseTab`
- No changes to chat, invites, or onboarding