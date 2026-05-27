
# Self-Contained Integrations + Guided Setup

This is a large build. Below is the scope, the order I'll ship it in, and a few decisions I need from you before I start so I don't waste cycles.

## Scope summary

Rebuild four tabs inside `/workspaces/$id` so users never leave YoFounder:

1. **GitHub tab** — 3-step guided setup (account → repo → token) when not connected. Once connected: repo summary + open issues + recent commits (already partly covered by the existing settings/saved token).
2. **Vercel tab** — guided setup (account → token → pick project), then in-app dashboard: current deployment, history (last 10), build logs (auto-refresh while building), env vars (list/add/delete), redeploy button.
3. **Supabase tab** — guided setup (account → project → URL + service_role key), then in-app dashboard: stats row, auth users + recent signups, tables list with data grid (paginate, add row, delete row), simple SQL editor, auth audit log.
4. **Domain tab** — guided GoDaddy purchase flow, save domain, DNS checklist with persistence, "Check if live" health check.

Plus:
- Connection status dots (green/gray) next to each tab name in the workspace top bar.
- New workspace columns: `vercel_token`, `vercel_project_id`, `vercel_project_name`, `supabase_url`, `supabase_service_key`, `dns_checklist` (already exists), `domain_last_checked_at`, `domain_last_status`.
- All API calls go through **TanStack server functions** (this stack does not use Supabase Edge Functions for app-internal logic — your spec says `/functions/v1/...` but those will be `createServerFn` RPCs with identical security: tokens stay server-side, never reach the browser). Same guarantee, fewer moving parts.

## Decisions I need from you

**1. Where do Vercel + Supabase credentials live?**
Your spec implies **per workspace** (different project per workspace). That means the `vercel_token` and `supabase_service_key` go on the `workspaces` table — shared by every member of that workspace. Confirm that's right, or say "per user on profiles" if you'd rather each member connect their own.

**2. Real Supabase SQL editor against the user's OWN Supabase project — confirm?**
The "Supabase tab" lets a user paste their service_role key and then run arbitrary SQL against *their* project. That's powerful and a footgun (DROP TABLE, etc.). I'll ship it with a big red warning + a confirm dialog for destructive-looking statements (DROP/TRUNCATE/DELETE without WHERE). OK?

**3. Build logs auto-refresh cadence**
Vercel build logs while `building`: poll every 3s, stop on `ready`/`error`. OK or you want realtime?

**4. Scope of this single turn**
This is genuinely ~6–10 hours of focused work (4 large pages, ~15 server functions, 1 migration, status-dot wiring, guided flows with persisted progress, SQL grid component, env-var manager). I can ship it in two passes:

- **Pass A (this turn):** migration + all server functions + GitHub tab + Vercel tab (setup flow + current deployment + history + redeploy) + connection dots.
- **Pass B (next turn):** Vercel env vars + build logs viewer + full Supabase tab + Domain tab.

Or I attempt the whole thing in one giant turn and accept that some polish (loading states, edge cases) will land in a follow-up. **Tell me A+B or "go big".**

## Plan (assuming defaults: per-workspace creds, SQL editor with warning, 3s poll, A+B split)

### Pass A

1. **Migration**: add to `workspaces`:
   - `vercel_token text`, `vercel_project_id text`, `vercel_project_name text`
   - `supabase_url text`, `supabase_service_key text`
   - `domain_last_checked_at timestamptz`, `domain_last_status int`
   - `setup_progress jsonb default '{}'::jsonb` (tracks which guided steps each integration has completed: `{github: 2, vercel: 1, supabase: 0, domain: 0}`)
   - Keep all existing RLS — workspace members can read/write their own workspace.

2. **Server functions** (`src/lib/integrations.functions.ts`):
   - `testVercelToken({token})` → GET /v2/user → `{username, email}`
   - `listVercelProjects({workspaceId})` → GET /v9/projects
   - `saveVercelConnection({workspaceId, token, projectId, projectName})`
   - `getVercelDeployments({workspaceId})` → GET /v6/deployments?projectId=&limit=10
   - `triggerVercelDeploy({workspaceId})` → POST /v13/deployments
   - `getVercelEnvVars({workspaceId})`
   - `addVercelEnvVar({workspaceId, key, value, target})`
   - `deleteVercelEnvVar({workspaceId, envId})`
   - `getVercelBuildLogs({workspaceId, deploymentId})`
   - `testSupabaseConnection({url, serviceKey})` — hit `${url}/rest/v1/` with apikey header
   - `saveSupabaseConnection({workspaceId, url, serviceKey})`
   - `getSupabaseReport({workspaceId})` — auth user count + recent signups + public tables + sizes
   - `getSupabaseTableData({workspaceId, table, page})`
   - `runSupabaseQuery({workspaceId, sql})` — proxies via PostgREST RPC or direct PG (will use the user-supplied service key over PostgREST `/rest/v1/rpc/` where possible; for raw SQL I'll create a `exec_sql` RPC instruction in the guided setup, OR use the SQL HTTP endpoint via `pg-meta` if available)
   - `getSupabaseAuthLogs({workspaceId})`
   - `checkDomainLive({workspaceId})` → fetch with 5s timeout, persist status

3. **GitHub tab** (in `workspaces.$id.tsx` tab content): 3-step setup card when no token; once connected, show repo summary + link to settings to manage.

4. **Vercel tab**: 3-step setup → dashboard with current deploy card, history list, redeploy button.

5. **Connection dots**: small colored dots in the tab bar, derived from a single `useQuery(['workspace-integrations', id])` that returns booleans.

### Pass B

6. Vercel env vars manager + build logs viewer with 3s poll.
7. Supabase tab full dashboard (stats, auth, tables grid, SQL editor with warning + confirm).
8. Domain tab guided setup + checklist persistence + live check.

## Notes on the "edge functions" in your spec

You wrote things like `/functions/v1/vercel-setup-test`. On this TanStack Start stack, those will be **typed server functions** (`createServerFn`) callable from the frontend as `await testVercelToken({data: {...}})`. The security model is identical (tokens stay on the server, validated by `requireSupabaseAuth` middleware, never exposed to the browser bundle). If you specifically want literal Supabase Edge Functions (separate deploy, Deno runtime, different log surface) say so and I'll switch — but server functions are the recommended path here.

---

**Reply with:**
1. Confirm per-workspace creds (or "per user")
2. Confirm SQL editor with warning (or "no raw SQL")
3. Confirm A+B split (or "go big in one turn")
4. Anything else to change

Then I'll start shipping.
