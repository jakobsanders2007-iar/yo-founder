# Migrating YoFounder to your own Supabase + Vercel + yo-founder.com

This is a one-time setup. After it's done, GitHub OAuth will work because
GitHub provider can be enabled directly in your own Supabase project
(Lovable Cloud's managed auth doesn't support GitHub).

## 0. What you need handy

- Your own Supabase project (create at https://supabase.com/dashboard)
- A Vercel account
- The `yo-founder.com` domain at GoDaddy
- A GitHub OAuth App (create at https://github.com/settings/developers)

---

## 1. Spin up your own Supabase project

1. Create a new project. Pick a region close to your users.
2. Once provisioned, copy these from **Project Settings → API**:
   - `Project URL`  → this becomes `VITE_SUPABASE_URL` and `SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_PUBLISHABLE_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never exposed)

## 2. Re-run the schema on your Supabase

Every migration in `supabase/migrations/` needs to run, in order, against
your new project. Easiest path:

```bash
# from the repo root, with Supabase CLI installed
supabase link --project-ref <YOUR_NEW_PROJECT_REF>
supabase db push
```

Alternative: open each file in `supabase/migrations/` in date order and
paste it into your Supabase SQL editor.

After it finishes, verify in the Supabase dashboard → Table Editor that
these tables exist: `profiles`, `workspaces`, `workspace_members`,
`workspace_invites`, `messages`, `message_reactions`, `prompts`,
`claude_code_jobs`.

## 3. Enable auth providers

**Authentication → Providers:**

- **Email**: enable. Turn OFF "Confirm email" only if you want instant
  signup; otherwise leave it on.
- **Google**: enable. Paste your Google OAuth client ID + secret
  (https://console.cloud.google.com → APIs & Services → Credentials).
- **GitHub**: enable. Paste the GitHub OAuth App credentials from step 4.

**Authentication → URL Configuration:**

- Site URL: `https://yo-founder.com`
- Redirect URLs (add each):
  - `https://yo-founder.com/**`
  - `https://*.vercel.app/**` (Vercel preview deployments)
  - `http://localhost:3000/**` (local dev)
  - `http://localhost:8080/**` (Lovable dev server)

## 4. Create the GitHub OAuth App

GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**:

- Application name: `YoFounder`
- Homepage URL: `https://yo-founder.com`
- Authorization callback URL:
  `https://<YOUR_NEW_PROJECT_REF>.supabase.co/auth/v1/callback`
  *(NOT your own domain — this must be the Supabase callback)*

Copy the Client ID + Client Secret into Supabase → Providers → GitHub.

The app already requests the correct scopes (`repo read:user user:email`)
from code, so nothing to add here.

## 5. Move runtime secrets

Your current Lovable Cloud project has these secrets that the server
functions need. Add the same names + values to **Supabase → Project
Settings → Edge Functions → Secrets** (or to Vercel env vars if you move
the server functions to Vercel — see step 6):

- `GEMINI_API_KEY`
- `LOVABLE_API_KEY` (only if you want to keep Lovable AI Gateway)
- `RESEND_API_KEY`

`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_DB_URL` are provided by Supabase automatically.

## 6. Deploy to Vercel

1. Import the GitHub repo into Vercel.
2. Framework preset: **TanStack Start** (or "Other" if not listed; the
   `vite.config.ts` handles it).
3. Set environment variables (Project Settings → Environment Variables):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your new Supabase Project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | new anon key |
   | `VITE_SUPABASE_PROJECT_ID` | new project ref |
   | `SUPABASE_URL` | same as `VITE_SUPABASE_URL` |
   | `SUPABASE_PUBLISHABLE_KEY` | same as `VITE_SUPABASE_PUBLISHABLE_KEY` |
   | `SUPABASE_SERVICE_ROLE_KEY` | service role key |
   | `GEMINI_API_KEY` | your key |
   | `RESEND_API_KEY` | your key |
   | `LOVABLE_API_KEY` | optional |

4. Deploy.

## 7. Point yo-founder.com at Vercel

In Vercel → Project → Settings → Domains, add `yo-founder.com` and
`www.yo-founder.com`. Vercel will show you DNS records to create.

In GoDaddy → DNS Management for `yo-founder.com`:

- **A record** for `@` → `76.76.21.21` (Vercel's apex IP — Vercel will
  confirm the exact value to use)
- **CNAME** for `www` → `cname.vercel-dns.com`

DNS can take up to ~24h to propagate but usually settles in minutes.

## 8. Smoke-test

Once DNS is live:

1. Visit `https://yo-founder.com/login`.
2. Click **Continue with GitHub**. You should be sent to GitHub, then
   bounced back to `/dashboard` signed in. (If you see "Unsupported
   provider" again, GitHub is not enabled in Supabase → step 3.)
3. Click **Continue with Google**. Same flow.
4. Create a workspace, invite yourself at a second email — make sure the
   Resend invite email arrives.

## 9. Optional cleanup

- In Lovable, you can keep using the preview for development. The same
  code talks to whichever Supabase the env vars point at. To dev against
  your new Supabase locally, put the new values in a local `.env.local`.
- The current Lovable Cloud Supabase can be left running (free tier) or
  deleted from Lovable settings once you're confident the new one works.

---

## Code that's already deploy-ready (no changes needed)

- `src/integrations/supabase/client.ts` — reads from env vars
- All four `signInWithOAuth({ provider: 'github', ... })` calls already
  use `redirectTo: window.location.origin + '/...'`, so they work on
  yo-founder.com, Vercel previews, and localhost without modification.
