# YoFounder — Build Plan

A multiplayer co-founder workspace where two humans + their respective AIs (Claude/GPT) chat together, generate Claude Code prompts, and ship them to GitHub.

## Stack note (important)

Your spec says "React + Vite + Supabase Edge Functions". This project is scaffolded on **TanStack Start** (React 19 + Vite 7) with **Lovable Cloud** (Supabase under the hood). I'll adapt cleanly:

- **Routing**: TanStack Router file routes under `src/routes/` (same URLs you specified: `/login`, `/onboarding`, `/dashboard`, `/workspaces/new`, `/workspaces/$id`, `/invite/$token`).
- **"Edge functions"**: Implemented as `createServerFn` (TanStack server functions). Same security model — keys stay server-side, never reach the browser. URLs like `/functions/v1/ai-respond` aren't needed; the client calls typed RPCs.
- **Supabase Realtime**: Used directly from the browser client for the `messages` table — unchanged from your spec.
- **Auth, DB, RLS, storage**: All via Lovable Cloud (Supabase).

If you'd rather I literally deploy Supabase Edge Functions instead of TanStack server functions, say so and I'll switch — but server functions are the recommended path here and give identical guarantees.

## Phase 1 — Foundation

1. Enable Lovable Cloud (provisions Supabase).
2. Database migration: `profiles`, `workspaces`, `workspace_members`, `workspace_invites`, `messages`, `prompts` with RLS + grants. Enable Realtime on `messages`. Trigger to auto-create profile on signup.
3. Design system in `src/styles.css`: dark theme (#080808 bg, #f59e0b amber brand, indigo/emerald accents), DM Sans + IBM Plex Mono via Google Fonts, sharp corners, 1px borders.

## Phase 2 — Auth & Onboarding

4. `/login` — email/password, dark, YoFounder logo + tagline.
5. `/onboarding` — 3 steps: identity (name + avatar color), AI provider (Claude/GPT + key, tested via `testAiKey` serverFn), GitHub PAT (tested via `testGithubToken` serverFn). Keys stored on `profiles` row.
6. `_authenticated` layout route gates the app.

## Phase 3 — Dashboard & Workspace creation

7. `/dashboard` — workspace cards grid + "New Workspace".
8. `/workspaces/new` — form (name, repo, optional Vercel/Supabase URLs, GoDaddy domain, invite email). Creates workspace + owner membership + pending invite row with token.
9. `/invite/$token` — accept flow, adds membership (max 8 members enforced).

## Phase 4 — Workspace shell

10. `/workspaces/$id` — top bar (logo, name, repo link, member avatars with online/offline ring via presence, settings) + tab bar (Chat | Prompts | Vercel | Supabase | Domain). Active tab amber underline. Mobile = bottom tab nav.

## Phase 5 — Chat (core)

11. Realtime message feed scoped to workspace. Auto-scroll, hover timestamps, avatar+initial, AI border colors (indigo Claude / emerald GPT), font split (Plex Mono for AI, DM Sans for humans).
12. Input bar: textarea, 1000 char limit, Cmd+Enter send.
13. Flow on send:
    - Insert human message (Realtime delivers to co-founder instantly).
    - Call `respondAsSenderAi` serverFn → inserts AI response.
    - Call `respondAsCofounderAi` serverFn → 2s delay, inserts second AI response.
    - Typing indicator (pulsing dots in sender color) driven by Realtime broadcast channel.
14. Inline error message on AI failure ("Claude encountered an error — try again"), no crash.
15. Floating "Generate Claude Code Prompt" button → `generatePrompt` serverFn → modal (review/edit/save → switches to Prompts tab).

## Phase 6 — Prompts tab

16. Split view: list (status badge, draft=gray, sent=green) + detail (editable title + content, "Send to GitHub as Issue", "Copy Prompt"). On send: `createGithubIssue` serverFn, persists URL/number, status=sent, success banner + GitHub link.
17. Notification dot on Prompts tab when new prompt arrives (Realtime on `prompts`).

## Phase 7 — Vercel / Supabase / Domain tabs

18. **Vercel**: "Open Dashboard" button + iframe-blocked fallback note + manual deploy status checker (serverFn fetches title/status).
19. **Supabase**: deep-link buttons (`/editor`, `/auth/users`, `/logs/explorer`) appended to project URL.
20. **Domain**: domain display + GoDaddy link + DNS checklist (persisted checkboxes) + notes textarea.

## Phase 8 — Polish & verify

21. SEO meta on public routes, sitemap.xml/robots.txt.
22. Manual smoke test: signup → onboarding → workspace → chat → prompt → GitHub issue.

## Technical details

- **Server functions** (replace "edge functions"):
  - `testAiKey({ provider, apiKey })`
  - `testGithubToken({ token })`
  - `respondAsSenderAi({ workspaceId, messageId })`
  - `respondAsCofounderAi({ workspaceId })` (2s delay)
  - `generatePrompt({ workspaceId })` — Claude Sonnet, max_tokens 600, strips ```json fences
  - `createGithubIssue({ workspaceId, promptId })`
  - `checkDeploymentStatus({ url })`
  - All wrapped with `requireSupabaseAuth`, 25s `AbortController` on external fetches, `max_tokens: 150` for chat.
- **Models**: `claude-sonnet-4-5` and `gpt-4o` as specified, called with the user's own API key from their `profiles` row.
- **RLS**: every table scoped via `workspace_members` membership; `has_workspace_access(workspace_id, user_id)` SECURITY DEFINER helper to avoid recursion. API keys on `profiles` only readable by the owner.
- **Grants**: `GRANT SELECT, INSERT, UPDATE, DELETE` to `authenticated` on all user tables; `GRANT ALL` to `service_role`.
- **Realtime**: `messages` table added to `supabase_realtime` publication. Presence + typing via Realtime broadcast channels keyed by workspace id.
- **Max 8 members**: enforced in `acceptInvite` serverFn with a count check inside a transaction.
- **Secrets**: User-supplied (Anthropic/OpenAI/GitHub) live on `profiles` (encrypted at rest by Postgres). No global LOVABLE_API_KEY needed since each user brings their own keys per spec.

This is a large build — expect it across several steps. Reply "go" to start, or tell me what to adjust (e.g., "use real Supabase Edge Functions", "skip Vercel/Domain tabs for v1", "use Lovable AI Gateway instead of user-supplied keys").
