import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CHAT_TOKENS = 150;
const PROMPT_TOKENS = 600;
const TIMEOUT_MS = 25_000;

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

// ---------- Test AI key ----------
export const testAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      provider: z.enum(["claude", "gpt"]),
      apiKey: z.string().min(10).max(500),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    try {
      if (data.provider === "claude") {
        await callClaude(data.apiKey, "You are a test.", [{ role: "user", content: "Say OK" }], 5);
      } else {
        await callOpenAI(data.apiKey, "You are a test.", [{ role: "user", content: "Say OK" }], 5);
      }
      return { success: true as const };
    } catch (e: any) {
      return { success: false as const, error: e?.message ?? "Unknown error" };
    }
  });

// ---------- Test GitHub token ----------
export const testGithubToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ token: z.string().min(10).max(500) }).parse(input)
  )
  .handler(async ({ data }) => {
    try {
      const res = await withTimeout((signal) =>
        fetch("https://api.github.com/user", {
          signal,
          headers: {
            Authorization: `Bearer ${data.token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "YoFounder",
          },
        })
      );
      if (!res.ok) {
        return { success: false as const, error: `GitHub returned ${res.status}` };
      }
      const json = await res.json();
      return { success: true as const, login: json.login as string, name: (json.name as string) ?? null };
    } catch (e: any) {
      return { success: false as const, error: e?.message ?? "Unknown error" };
    }
  });

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
    const label =
      m.sender_type === "human"
        ? `[${name}]`
        : `[${name}'s ${m.ai_provider === "claude" ? "Claude" : "GPT"}]`;
    const isMyAi = m.sender_type === "ai" && m.sender_user_id === myUserId;
    return {
      role: isMyAi ? "assistant" : "user",
      content: `${label}: ${m.content}`,
    } as ChatMsg;
  });
}

async function respondForUser(opts: {
  supabase: any;
  workspaceId: string;
  forUserId: string;
}) {
  const { supabase, workspaceId, forUserId } = opts;
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("display_name, ai_provider, anthropic_key, openai_key")
    .eq("id", forUserId)
    .single();
  if (pErr || !profile) throw new Error("Profile not found");
  if (!profile.ai_provider) throw new Error("No AI provider configured");

  const apiKey = profile.ai_provider === "claude" ? profile.anthropic_key : profile.openai_key;
  if (!apiKey) throw new Error(`No ${profile.ai_provider} API key configured`);

  const history = await fetchHistory(supabase, workspaceId);
  const formatted = buildHistoryForProvider(history, forUserId);

  const system = `You are ${profile.display_name}'s AI assistant. You are in a shared workspace with their co-founder. Help with coding questions, product decisions, technical problems, and anything else they need. Be conversational, concise, and genuinely helpful. Max 3 sentences unless more detail is needed.`;

  let text: string;
  try {
    text = profile.ai_provider === "claude"
      ? await callClaude(apiKey, system, formatted, CHAT_TOKENS)
      : await callOpenAI(apiKey, system, formatted, CHAT_TOKENS);
  } catch (e: any) {
    await supabase.from("messages").insert({
      workspace_id: workspaceId,
      sender_user_id: forUserId,
      sender_type: "ai",
      ai_provider: profile.ai_provider,
      content: `${profile.ai_provider === "claude" ? "Claude" : "GPT"} encountered an error — try again`,
      is_error: true,
    });
    return { ok: false, error: e?.message ?? "Unknown" };
  }

  await supabase.from("messages").insert({
    workspace_id: workspaceId,
    sender_user_id: forUserId,
    sender_type: "ai",
    ai_provider: profile.ai_provider,
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
    return respondForUser({ supabase, workspaceId: data.workspaceId, forUserId: userId });
  });

export const respondAsCofounderAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    // Find a co-founder
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
    // Use the requester's anthropic key (fallback: any member with claude key)
    const { data: me } = await supabase
      .from("profiles")
      .select("anthropic_key, openai_key, ai_provider, display_name")
      .eq("id", userId)
      .single();

    let apiKey: string | null = me?.anthropic_key ?? null;
    let useOpenAI = false;
    if (!apiKey) {
      // Fallback: any member with anthropic key
      const { data: members } = await supabase
        .from("workspace_members")
        .select("profiles:user_id(anthropic_key, openai_key)")
        .eq("workspace_id", data.workspaceId);
      for (const m of members ?? []) {
        if (m.profiles?.anthropic_key) { apiKey = m.profiles.anthropic_key; break; }
      }
      if (!apiKey) {
        // last resort: use OpenAI
        if (me?.openai_key) { apiKey = me.openai_key; useOpenAI = true; }
      }
    }
    if (!apiKey) throw new Error("No API key available to generate a prompt");

    const history = await fetchHistory(supabase, data.workspaceId);
    const conversation = history.map((m) => {
      const name = m.profiles?.display_name || "User";
      const label = m.sender_type === "human" ? name : `${name}'s ${m.ai_provider === "claude" ? "Claude" : "GPT"}`;
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

    const raw = useOpenAI
      ? await callOpenAI(apiKey, system, [userMsg], PROMPT_TOKENS)
      : await callClaude(apiKey, system, [userMsg], PROMPT_TOKENS);

    // Strip fences
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
    let parsed: { title: string; content: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try to extract a JSON object substring
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

    // Try requester's token first, then owner's
    const { data: meProf } = await supabase
      .from("profiles").select("github_token").eq("id", userId).single();
    let token: string | null = meProf?.github_token ?? null;
    if (!token) {
      const { data: ownerProf } = await supabase
        .from("profiles").select("github_token").eq("id", ws.created_by).single();
      token = ownerProf?.github_token ?? null;
    }
    if (!token) throw new Error("No GitHub token available. Set one in onboarding.");

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
          body: `## Claude Code Prompt\n\n${prompt.content}\n\n---\n**Instructions:**\n1. Open Claude Code in your terminal pointed at this repo\n2. Paste this prompt into Claude Code\n3. Let Claude Code implement the changes\n4. Claude Code will ask if you want to push — click yes\n5. Come back to the GitHub tab in YoFounder to review and merge the PR\n\n*Generated by YoFounder — repo: ${ws.github_repo}*`,
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
      provider: z.enum(["claude", "gpt"]),
      apiKey: z.string().min(10).max(500),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const payload: any = { id: userId, ai_provider: data.provider };
    if (data.provider === "claude") payload.anthropic_key = data.apiKey;
    else payload.openai_key = data.apiKey;
    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveGithubToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ token: z.string().min(10).max(500), login: z.string().min(1).max(100) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase.from("profiles")
      .upsert(
        { id: userId, github_token: data.token, github_username: data.login, onboarded: true },
        { onConflict: "id" }
      );
    if (error) throw new Error(error.message);
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
