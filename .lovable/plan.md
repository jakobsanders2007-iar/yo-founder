# YoFounder Core Rebuild

This is a large 5-part rebuild. Before I start, I need to confirm scope and a few specifics so I don't waste a round-trip.

## Part 1 — Invite System
- Add "Invite" button to workspace top bar + settings
- Email via Resend: subject `[Name] invited you to [Workspace] on YoFounder`, CTA to `yo-founder.com/invite/[token]`
- `/invite/[token]` page already exists — extend it to redirect to login first, then back
- Member list in top bar: avatars, online ring (last_seen_at < 5min), tooltip with provider, click → profile card

**DB changes needed:**
- `workspace_invites` already has token/workspace_id/email/invited_by/accepted/created_at ✓
- Need Resend integration: requires `RESEND_API_KEY` secret

## Part 2 — AI Chat Settings
- Add `ai_chat_settings jsonb` column to `workspaces` table with default:
  `{"who_responds":"everyone","response_style":"simultaneous","response_trigger":"every_message","active_members":[]}`
- New "AI Settings" section in workspace settings (owner only)
- 4 radio groups + per-member checkbox list

## Part 3 — Group Chat Rebuild
- **Delete** "AI teammates" concept (Strategist/Engineer/Designer/Growth)
- Real group chat: humans + each person's AI on their behalf
- Update system prompt in `yofounder.functions.ts` to the new conversational one
- Server function changes: `respondAsSenderAi` / `respondAsCofounderAi` replaced with `respondToMessage` that reads `ai_chat_settings` and triggers the right AIs
- UI: right-align own human messages, left-align others; AI messages indented under owner; provider-colored left border (indigo/emerald/blue); message grouping; emoji reactions (👍✅🔥💡); delete own; @mentions dropdown with `@name @claude @gpt @gemini @all`
- "Generate Build Prompt" demoted to small top-right button

**DB changes needed:**
- New `message_reactions` table (message_id, user_id, emoji)
- `messages` already covers content/sender — no change needed

## Part 4 — Code Tab Simplified
- Strip Files/Diff/Logs from Code tab
- Keep: prompt input, job status panel (4 steps), prompt history, approval card, preview card with Vercel iframe

## Part 5 — GitHub Tab Expanded
- Add sub-tabs: PRs | Commits | Files | Diff | Logs
- Files: full repo tree via GitHub API (edge call), syntax-highlighted read-only viewer
- Diff: most recent PR/job diff
- Logs: plain-English job logs with "Fix with AI" button → routes to Code tab with prefilled prompt

## Questions before I build

1. **Resend** — `RESEND_API_KEY` is not in your secrets list. Should I request it now, or skip email and just generate the invite link to copy?
2. **AI teammates removal** — confirm: the `ai_teammates`/Strategist/Engineer concept currently in `workspaces.$id.tsx` should be fully removed (not preserved as a toggle)?
3. **Member-list realtime** — for "online if active in 5 min", OK to update `profiles.last_seen_at` every 60s while the workspace tab is open?
4. **Scope** — this is ~6-8 hours of work compressed into one turn. OK if I deliver in this order and check in if I'm running long: (1) DB migration, (2) invite + email, (3) AI settings UI + storage, (4) chat rebuild, (5) Code/GitHub reorg?

Once you answer (especially #1 and #2), I'll start with the migration.