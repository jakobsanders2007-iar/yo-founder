import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CHAT_TOKENS = 150;
const PROMPT_TOKENS = 600;
const TIMEOUT_MS = 25_000;

function buildSystemPrompt(memberName: string) {
  return `You are ${memberName}'s AI in a co-founder group chat on YoFounder. Other founders and their AIs are in this conversation too.
Be conversational, direct, and genuinely helpful.
Talk like a smart co-founder, not a corporate assistant.
Keep responses under 4 sentences unless asked for more.
Never use headers or bullet points unless specifically asked.
Never say 'As an AI' or 'I'm here to help'.
Just talk naturally.`;
}
const SYSTEM_PROMPT = buildSystemPrompt("the founder");

async function withTimeout(fn: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
export type Provider = "claude" | "gpt" | "gemini";

async function callClaude(apiKey: string, systemPrompt: string, history: ChatMsg[], maxTokens: number) {
  const res = await withTimeout((signal) =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: history.filter((m) => m.role !== "system").map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      }),
    })
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Claude API error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("Claude returned no text");
  return text as string;
}

async function callOpenAI(apiKey: string, systemPrompt: string, history: ChatMsg[], maxTokens: number) {
  const res = await withTimeout((signal) =>
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: maxTokens,
        messages: [{ role: "system", content: systemPrompt }, ...history],
      }),
    })
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI returned no text");
  return text as string;
}

async function callGemini(apiKey: string, systemPrompt: string, history: ChatMsg[], maxTokens: number) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  // Inline the system prompt into the conversation for broadest compatibility
  const fullConversation = [
    `System: ${systemPrompt}`,
    ...history.map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`),
  ].join("\n\n");
  const res = await withTimeout((signal) =>
    fetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullConversation }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    })
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text");
  return text as string;
}

async function callProvider(provider: Provider, apiKey: string, systemPrompt: string, history: ChatMsg[], maxTokens: number) {
  if (provider === "claude") return callClaude(apiKey, systemPrompt, history, maxTokens);
  if (provider === "gpt") return callOpenAI(apiKey, systemPrompt, history, maxTokens);
  return callGemini(apiKey, systemPrompt, history, maxTokens);
}

function providerLabel(p: Provider | string | null | undefined) {
  if (p === "claude") return "Claude";
  if (p === "gpt") return "ChatGPT";
  if (p === "gemini") return "Gemini";
  return "AI";
}

// ---------- Test AI key ----------
// ---------- AI respond (sender) ----------
async function fetchHistory(supabase: any, workspaceId: string) {
  const { data } = await supabase
    .from("messages")
    .select("sender_user_id, sender_type, ai_provider, content, created_at, profiles:sender_user_id(display_name)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).reverse() as any[];
}

function buildHistoryForProvider(history: any[], myUserId: string): ChatMsg[] {
  return history.map((m) => {
    const name = m.profiles?.display_name || "User";
    const label = m.sender_type === "human" ? `[${name}]` : `[${name}'s ${providerLabel(m.ai_provider)}]`;
    const isMyAi = m.sender_type === "ai" && m.sender_user_id === myUserId;
    return {
      role: isMyAi ? "assistant" : "user",
      content: `${label}: ${m.content}`,
    } as ChatMsg;
  });
}

function keyForProvider(profile: any): { provider: Provider; key: string } | null {
  const p = profile?.ai_provider as Provider | null;
  // Honor the explicit provider choice if a key is available for it
  if (p === "claude" && profile?.anthropic_key) return { provider: "claude", key: profile.anthropic_key };
  if (p === "gpt" && profile?.openai_key) return { provider: "gpt", key: profile.openai_key };
  if (p === "gemini") {
    const k = profile?.gemini_key || process.env.GEMINI_API_KEY;
    if (k) return { provider: "gemini", key: k };
  }
  // Fallback: use whatever key is available, preferring Gemini (free server key)
  if (profile?.gemini_key) return { provider: "gemini", key: profile.gemini_key };
  if (process.env.GEMINI_API_KEY) return { provider: "gemini", key: process.env.GEMINI_API_KEY };
  if (profile?.anthropic_key) return { provider: "claude", key: profile.anthropic_key };
  if (profile?.openai_key) return { provider: "gpt", key: profile.openai_key };
  return null;
}

async function respondForUser(opts: {
  supabase: any;
  workspaceId: string;
  forUserId: string;
}) {
  const { supabase, workspaceId, forUserId } = opts;
  // Read profile via admin (cofounder's keys not visible to caller via RLS)
  const { data: profile, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("display_name, ai_provider")
    .eq("id", forUserId)
    .single();
  if (pErr || !profile) throw new Error("Profile not found");

  const { data: secrets } = await supabaseAdmin
    .from("profile_secrets")
    .select("anthropic_key, openai_key, gemini_key")
    .eq("user_id", forUserId)
    .maybeSingle();
  const profileWithKeys = { ...profile, ...(secrets ?? {}) };


  const sel = keyForProvider(profileWithKeys);
  if (!sel) {
    return { ok: false, error: "No AI key configured" };
  }

  const history = await fetchHistory(supabase, workspaceId);
  const formatted = buildHistoryForProvider(history, forUserId);

  let text: string;
  try {
    text = await callProvider(sel.provider, sel.key, buildSystemPrompt(profile.display_name || "the founder"), formatted, CHAT_TOKENS);

  } catch (e: any) {
    // RLS blocks sender_type='ai' inserts from user client — use admin
    await supabaseAdmin.from("messages").insert({
      workspace_id: workspaceId,
      sender_user_id: forUserId,
      sender_type: "ai",
      ai_provider: sel.provider,
      content: "Something went wrong — try sending your message again.",
      is_error: true,
    });
    return { ok: false, error: e?.message ?? "Unknown" };
  }

  await supabaseAdmin.from("messages").insert({
    workspace_id: workspaceId,
    sender_user_id: forUserId,
    sender_type: "ai",
    ai_provider: sel.provider,
    content: text.trim(),
  });
  return { ok: true };
}

export const respondAsSenderAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isMember } = await supabase.rpc("is_workspace_member", { _workspace_id: data.workspaceId });
    if (!isMember) throw new Error("Not a member of this workspace");
    return respondForUser({ supabase, workspaceId: data.workspaceId, forUserId: userId });
  });

export const respondAsCofounderAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isMember } = await supabase.rpc("is_workspace_member", { _workspace_id: data.workspaceId });
    if (!isMember) throw new Error("Not a member of this workspace");
    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", data.workspaceId);
    const cofounder = (members ?? []).find((m: any) => m.user_id !== userId);
    if (!cofounder) return { ok: false, skipped: true as const };
    await new Promise((r) => setTimeout(r, 2000));
    return respondForUser({ supabase, workspaceId: data.workspaceId, forUserId: cofounder.user_id });
  });

// ---------- Generate prompt ----------
export const generatePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const [{ data: prof }, { data: sec }] = await Promise.all([
      supabase.from("profiles").select("ai_provider, display_name").eq("id", userId).single(),
      supabase.from("profile_secrets").select("anthropic_key, openai_key, gemini_key").eq("user_id", userId).maybeSingle(),
    ]);
    const me = { ...(prof ?? {}), ...(sec ?? {}) } as any;

    let sel = keyForProvider(me);
    if (!sel) {
      // any provider key on profile, or gemini server key
      if (me?.anthropic_key) sel = { provider: "claude", key: me.anthropic_key };
      else if (me?.openai_key) sel = { provider: "gpt", key: me.openai_key };
      else if (process.env.GEMINI_API_KEY) sel = { provider: "gemini", key: process.env.GEMINI_API_KEY };
    }
    if (!sel) throw new Error("No AI key available to generate a prompt");

    const history = await fetchHistory(supabase, data.workspaceId);
    const conversation = history.map((m) => {
      const name = m.profiles?.display_name || "User";
      const label = m.sender_type === "human" ? name : `${name}'s ${providerLabel(m.ai_provider)}`;
      return `${label}: ${m.content}`;
    }).join("\n\n");

    const system = `You are a technical co-founder assistant. Based on this conversation, generate a Claude Code prompt that can be pasted directly into Claude Code CLI to implement the discussed changes.

Format your response as JSON:
{
  "title": "short descriptive title (max 60 chars)",
  "content": "## Context\\n[what was discussed and why this change is needed]\\n\\n## Task\\n[specific implementation instructions]\\n\\n## Files to Check\\n[any specific files mentioned, or 'Explore the codebase to find relevant files']\\n\\n## Success Criteria\\n[what the implementation should achieve]"
}

Return ONLY the JSON, no markdown fences, no explanation.`;

    const userMsg: ChatMsg = { role: "user", content: `Conversation:\n\n${conversation}` };
    const raw = await callProvider(sel.provider, sel.key, system, [userMsg], PROMPT_TOKENS);

    let cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
    let parsed: { title: string; content: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Could not parse prompt JSON");
      parsed = JSON.parse(m[0]);
    }
    if (!parsed.title || !parsed.content) throw new Error("Prompt JSON missing fields");
    return parsed;
  });

// ---------- GitHub create issue ----------
export const createGithubIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), promptId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: ws } = await supabase
      .from("workspaces")
      .select("github_repo, created_by")
      .eq("id", data.workspaceId)
      .single();
    if (!ws) throw new Error("Workspace not found");

    const { data: meSec } = await supabase
      .from("profile_secrets").select("github_token").eq("user_id", userId).maybeSingle();
    let token: string | null = meSec?.github_token ?? null;
    if (!token) {
      const { data: ownerSec } = await supabase
        .from("profile_secrets").select("github_token").eq("user_id", ws.created_by).maybeSingle();
      token = ownerSec?.github_token ?? null;
    }
    if (!token) throw new Error("No GitHub token available. Set one in Settings → GitHub.");

    const { data: prompt } = await supabase
      .from("prompts").select("title, content").eq("id", data.promptId).single();
    if (!prompt) throw new Error("Prompt not found");

    const res = await withTimeout((signal) =>
      fetch(`https://api.github.com/repos/${ws.github_repo}/issues`, {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "YoFounder",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: `[Claude Code] ${prompt.title}`,
          body: `## Claude Code Prompt\n\n${prompt.content}\n\n---\n*Generated by YoFounder*`,
          labels: ["yofounder", "claude-code"],
        }),
      })
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub error ${res.status}: ${text.slice(0, 200)}`);
    }
    const issue = await res.json();
    await supabase.from("prompts").update({
      github_issue_url: issue.html_url,
      github_issue_number: issue.number,
      status: "pushed",
    }).eq("id", data.promptId);
    return { issue_url: issue.html_url as string, issue_number: issue.number as number };
  });

// ---------- Save user keys ----------
export const saveAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      provider: z.enum(["claude", "gpt", "gemini"]),
      apiKey: z.string().max(500).optional().default(""),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // 1) Set provider on profile
    const { error: profErr } = await supabase
      .from("profiles")
      .upsert({ id: userId, ai_provider: data.provider }, { onConflict: "id" });
    if (profErr) throw new Error(profErr.message);

    // 2) Store key in profile_secrets (keys live in a separate table)
    if (data.provider === "claude" || data.provider === "gpt") {
      if (!data.apiKey || data.apiKey.length < 10) throw new Error("Missing key");
      const secretPayload: any = { user_id: userId, updated_at: new Date().toISOString() };
      if (data.provider === "claude") secretPayload.anthropic_key = data.apiKey;
      if (data.provider === "gpt") secretPayload.openai_key = data.apiKey;
      const { error: secErr } = await supabase
        .from("profile_secrets")
        .upsert(secretPayload, { onConflict: "user_id" });
      if (secErr) throw new Error(secErr.message);
    }
    // gemini: server uses GEMINI_API_KEY, no user key needed
    return { ok: true };
  });

export const saveGithubToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ token: z.string().min(10).max(500), login: z.string().min(1).max(100).optional() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const profilePayload: Record<string, any> = { id: userId, onboarded: true };
    if (data.login) profilePayload.github_username = data.login;

    const { error: profErr } = await supabase.from("profiles")
      .upsert(profilePayload, { onConflict: "id" });
    if (profErr) throw new Error(profErr.message);
    const { error: secErr } = await supabase.from("profile_secrets")
      .upsert(
        { user_id: userId, github_token: data.token, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    if (secErr) throw new Error(secErr.message);
    return { ok: true };
  });

// ---------- Check deployment status ----------
export const checkDeploymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ url: z.string().url().max(500) }).parse(input)
  )
  .handler(async ({ data }) => {
    try {
      const res = await withTimeout((signal) =>
        fetch(data.url, { signal, redirect: "follow" })
      );
      const html = await res.text().catch(() => "");
      const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
      return {
        ok: true as const,
        status: res.status,
        title: titleMatch?.[1]?.trim() ?? null,
        checkedAt: new Date().toISOString(),
      };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "Failed to fetch", checkedAt: new Date().toISOString() };
    }
  });

// ---------- Accept invite ----------
export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ token: z.string().min(10).max(100) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: invite, error } = await supabase
      .from("workspace_invites")
      .select("id, workspace_id, accepted")
      .eq("token", data.token)
      .single();
    if (error || !invite) throw new Error("Invite not found");
    if (invite.accepted) throw new Error("Invite already accepted");

    const { count } = await supabase
      .from("workspace_members")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", invite.workspace_id);
    if ((count ?? 0) >= 8) throw new Error("Workspace is full (max 8 members)");

    const { error: insErr } = await supabase.from("workspace_members").insert({
      workspace_id: invite.workspace_id,
      user_id: userId,
      role: "cofounder",
    });
    if (insErr && !insErr.message.includes("duplicate")) throw new Error(insErr.message);

    await supabase.from("workspace_invites").update({ accepted: true }).eq("id", invite.id);
    return { workspaceId: invite.workspace_id as string };
  });

// ---------- Send invite (creates row + emails via Resend) ----------
export const sendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      email: z.string().email().max(200),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: ws, error: wsErr } = await supabase
      .from("workspaces").select("name").eq("id", data.workspaceId).single();
    if (wsErr || !ws) throw new Error("Workspace not found");

    const { data: me } = await supabase
      .from("profiles").select("display_name").eq("id", userId).single();
    const inviterName = me?.display_name || "A founder";

    const { data: invite, error: invErr } = await supabase
      .from("workspace_invites")
      .insert({ workspace_id: data.workspaceId, invited_by: userId, email: data.email })
      .select("token").single();
    if (invErr || !invite) throw new Error(invErr?.message ?? "Failed to create invite");

    const link = `https://yo-founder.com/invite/${invite.token}`;
    const subject = `${inviterName} invited you to ${ws.name} on YoFounder`;
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0a0a0a">
        <h1 style="font-size:22px;margin:0 0 16px">You've been invited to YoFounder</h1>
        <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 12px">
          Your co-founder <strong>${escapeHtml(inviterName)}</strong> is building
          <strong>${escapeHtml(ws.name)}</strong> on YoFounder and wants you to join.
        </p>
        <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 28px">
          Click below to accept and connect your AI.
        </p>
        <a href="${link}" style="display:inline-block;background:#f59e0b;color:#0a0a0a;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px">
          Join ${escapeHtml(ws.name)}
        </a>
        <p style="font-size:13px;color:#6b7280;margin:32px 0 0">
          Or open this link: <a href="${link}" style="color:#f59e0b">${link}</a>
        </p>
        <p style="font-size:12px;color:#9ca3af;margin:32px 0 0">yo-founder.com</p>
      </div>`;

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return { ok: true, link, emailed: false, reason: "Resend not configured — share the link manually" };
    }

    const res = await withTimeout((signal) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: "YoFounder <invites@yo-founder.com>",
          to: [data.email],
          subject,
          html,
        }),
      })
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Fallback to onboarding sender if domain isn't verified yet
      if (text.includes("domain") || res.status === 403) {
        const res2 = await withTimeout((signal) =>
          fetch("https://api.resend.com/emails", {
            method: "POST", signal,
            headers: { "content-type": "application/json", Authorization: `Bearer ${resendKey}` },
            body: JSON.stringify({ from: "YoFounder <onboarding@resend.dev>", to: [data.email], subject, html }),
          })
        );
        if (!res2.ok) {
          return { ok: true, link, emailed: false, reason: "Couldn't send email — share the link" };
        }
        return { ok: true, link, emailed: true };
      }
      return { ok: true, link, emailed: false, reason: `Email failed (${res.status})` };
    }
    return { ok: true, link, emailed: true };
  });

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c] as string));
}

// ---------- Multi-AI Group Chat (Claude and ChatGPT) ----------
async function respondAsGroupAiMember(opts: {
  supabase: any;
  workspaceId: string;
  forUserId: string;
  aiName: "claude" | "gpt";
  systemPrompt: string;
}) {
  const { supabase, workspaceId, forUserId, aiName, systemPrompt } = opts;
  const history = await fetchHistory(supabase, workspaceId);
  const formatted = buildHistoryForGroupChat(history);

  let text: string;
  let provider: Provider;
  let apiKey: string;

  if (aiName === "claude") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      await supabaseAdmin.from("messages").insert({
        workspace_id: workspaceId,
        sender_user_id: forUserId,
        sender_type: "ai",
        ai_provider: "claude",
        content: "Claude is not configured on this server.",
        is_error: true,
      });
      return { ok: false, error: "Claude API key not configured" };
    }
    provider = "claude";
    apiKey = key;
  } else {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      await supabaseAdmin.from("messages").insert({
        workspace_id: workspaceId,
        sender_user_id: forUserId,
        sender_type: "ai",
        ai_provider: "gpt",
        content: "ChatGPT is not configured on this server.",
        is_error: true,
      });
      return { ok: false, error: "OpenAI API key not configured" };
    }
    provider = "gpt";
    apiKey = key;
  }

  try {
    text = await callProvider(provider, apiKey, systemPrompt, formatted, CHAT_TOKENS);
  } catch (e: any) {
    await supabaseAdmin.from("messages").insert({
      workspace_id: workspaceId,
      sender_user_id: forUserId,
      sender_type: "ai",
      ai_provider: provider,
      content: "Something went wrong — try sending your message again.",
      is_error: true,
    });
    return { ok: false, error: e?.message ?? "Unknown error" };
  }

  await supabaseAdmin.from("messages").insert({
    workspace_id: workspaceId,
    sender_user_id: forUserId,
    sender_type: "ai",
    ai_provider: provider,
    content: text.trim(),
  });
  return { ok: true };
}

function buildHistoryForGroupChat(messages: any[]): ChatMsg[] {
  const result: ChatMsg[] = [];
  for (const m of messages.slice(-30)) {
    const role = m.sender_type === "human" ? "user" : "assistant";
    const name = m.profiles?.display_name || (m.ai_provider === "claude" ? "Claude" : m.ai_provider === "gpt" ? "ChatGPT" : "AI");
    const label = m.sender_type === "ai" ? name : name;
    result.push({ role, content: `${label}: ${m.content}` });
  }
  return result;
}

export const respondAsClaudeAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isMember } = await supabase.rpc("is_workspace_member", { _workspace_id: data.workspaceId });
    if (!isMember) throw new Error("Not a member");

    const { data: ws } = await supabase
      .from("workspaces")
      .select("github_repo, name")
      .eq("id", data.workspaceId)
      .single();

    const systemPrompt = `You are Claude, an AI engineer in a group workspace chat on YoFounder. Your teammate is ChatGPT. You two argue constantly but you're actually best friends who respect each other deeply.

Your ONLY job in this chat is to help produce the single best Claude Code prompt the user can paste directly into the Claude Code CLI. You know the user's full stack: Supabase (database + auth + realtime), Vercel (deployments + previews + env vars), GitHub (repos + PRs + branches), GoDaddy (DNS + domains), and Claude Code (the CLI they use to implement everything). They use nothing else.

Context: Working with GitHub repo "${ws?.github_repo || "not connected"}" on the "${ws?.name || "workspace"}" project.

When the user describes something they want to build or fix:
1. Form your own strong opinion on the best approach
2. Challenge ChatGPT's approach if you disagree — be direct, even blunt
3. Eventually converge on one master prompt together
4. When you both agree, output the final prompt clearly marked as FINAL PROMPT:

Keep responses conversational and under 6 sentences unless you're outputting the final prompt. Never use bullet points or headers in regular chat — save structure for the final prompt itself.`;

    return respondAsGroupAiMember({ supabase, workspaceId: data.workspaceId, forUserId: userId, aiName: "claude", systemPrompt });
  });

export const respondAsGptAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isMember } = await supabase.rpc("is_workspace_member", { _workspace_id: data.workspaceId });
    if (!isMember) throw new Error("Not a member");

    const { data: ws } = await supabase
      .from("workspaces")
      .select("github_repo, name")
      .eq("id", data.workspaceId)
      .single();

    const systemPrompt = `You are ChatGPT, an AI engineer in a group workspace chat on YoFounder. Your teammate is Claude. You two argue constantly but you're actually best friends who genuinely respect each other.

Your ONLY job is to help produce the single best Claude Code prompt the user can paste directly into the Claude Code CLI. You know the user's full stack: Supabase (database + auth + realtime), Vercel (deployments + previews + env vars), GitHub (repos + PRs + branches), GoDaddy (DNS + domains), and Claude Code (the CLI they use to implement everything). They use nothing else.

Context: Working with GitHub repo "${ws?.github_repo || "not connected"}" on the "${ws?.name || "workspace"}" project.

When the user describes something they want to build or fix:
1. Form your own strong opinion on the best approach
2. Push back on Claude if you disagree — don't just agree to agree
3. Eventually converge on one master prompt together
4. When you both agree, output the final prompt clearly marked as FINAL PROMPT:

Keep responses conversational and under 6 sentences unless outputting the final prompt. Never use bullets or headers in regular chat.`;

    return respondAsGroupAiMember({ supabase, workspaceId: data.workspaceId, forUserId: userId, aiName: "gpt", systemPrompt });
  });

// ---------- Custom AI Management (BYOM) ----------
export const addCustomAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      providerName: z.string().min(1).max(100),
      model: z.string().min(1).max(200),
      apiKey: z.string().min(1).max(2000),
      endpointUrl: z.string().url().max(500).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isMember } = await supabase.rpc("is_workspace_member", { _workspace_id: data.workspaceId });
    if (!isMember) throw new Error("Not a member");

    const { data: ai, error: aiErr } = await supabase
      .from("custom_ai_members")
      .insert({
        workspace_id: data.workspaceId,
        added_by: userId,
        provider_name: data.providerName,
        model: data.model,
        endpoint_url: data.endpointUrl || null,
      })
      .select()
      .single();
    if (aiErr || !ai) throw new Error(aiErr?.message ?? "Failed to add AI");

    // Store API key in workspace_secrets
    const { data: secrets } = await supabase
      .from("workspace_secrets")
      .select("custom_ai_keys")
      .eq("workspace_id", data.workspaceId)
      .single();
    const currentKeys = (secrets?.custom_ai_keys ?? {}) as Record<string, string>;
    currentKeys[ai.id] = data.apiKey;

    await supabaseAdmin.from("workspace_secrets").update({ custom_ai_keys: currentKeys }).eq("workspace_id", data.workspaceId);

    return { ok: true, aiId: ai.id, providerName: ai.provider_name };
  });

export const removeCustomAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      customAiId: z.string().uuid(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: isMember } = await supabase.rpc("is_workspace_owner", { _workspace_id: data.workspaceId });
    if (!isMember) throw new Error("Must be workspace owner");

    const { error } = await supabase
      .from("custom_ai_members")
      .delete()
      .eq("id", data.customAiId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);

    // Remove API key from workspace_secrets
    const { data: secrets } = await supabase
      .from("workspace_secrets")
      .select("custom_ai_keys")
      .eq("workspace_id", data.workspaceId)
      .single();
    const currentKeys = (secrets?.custom_ai_keys ?? {}) as Record<string, string>;
    delete currentKeys[data.customAiId];

    await supabaseAdmin.from("workspace_secrets").update({ custom_ai_keys: currentKeys }).eq("workspace_id", data.workspaceId);

    return { ok: true };
  });

export const listCustomAis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: isMember } = await supabase.rpc("is_workspace_member", { _workspace_id: data.workspaceId });
    if (!isMember) throw new Error("Not a member");

    const { data: ais } = await supabase
      .from("custom_ai_members")
      .select("id, provider_name, model, endpoint_url, created_at")
      .eq("workspace_id", data.workspaceId);

    return { ais: ais ?? [] };
  });

