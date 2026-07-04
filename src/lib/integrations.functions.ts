import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---- secrets helpers (server-only; bypass RLS via admin client after authz) ----
async function assertWorkspaceAccess(supabase: any, workspaceId: string) {
  const { data, error } = await supabase
    .from("workspaces").select("id").eq("id", workspaceId).single();
  if (error || !data) throw new Error("Workspace not found or not accessible");
}
async function getWorkspaceSecrets(supabase: any, workspaceId: string) {
  await assertWorkspaceAccess(supabase, workspaceId);
  const { data } = await supabaseAdmin
    .from("workspace_secrets")
    .select("vercel_token, supabase_service_key, supabase_url")
    .eq("workspace_id", workspaceId).maybeSingle();
  return data ?? { vercel_token: null, supabase_service_key: null, supabase_url: null };
}
async function upsertWorkspaceSecrets(workspaceId: string, patch: Record<string, any>) {
  const { error } = await supabaseAdmin
    .from("workspace_secrets")
    .upsert({ workspace_id: workspaceId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
  if (error) throw new Error(error.message);
}
async function getProfileSecrets(userId: string) {
  const { data } = await supabaseAdmin
    .from("profile_secrets")
    .select("github_token, anthropic_key, openai_key, gemini_key")
    .eq("user_id", userId).maybeSingle();
  return data ?? { github_token: null, anthropic_key: null, openai_key: null, gemini_key: null };
}


const TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function getWorkspace(supabase: any, workspaceId: string) {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();
  if (error || !data) throw new Error("Workspace not found or not accessible");
  return data;
}

/* =====================================================
   VERCEL
   ===================================================== */

export const testVercelToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ token: z.string().min(10).max(500) }).parse(input)
  )
  .handler(async ({ data }) => {
    try {
      const res = await fetchWithTimeout("https://api.vercel.com/v2/user", {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return { success: false as const, error: `Vercel ${res.status}: ${txt.slice(0, 200)}` };
      }
      const j = await res.json();
      return {
        success: true as const,
        username: j.user?.username ?? j.user?.name ?? "user",
        email: j.user?.email ?? null,
      };
    } catch (e: any) {
      return { success: false as const, error: e?.message ?? "Failed" };
    }
  });

async function vercelGet(token: string, path: string) {
  const res = await fetchWithTimeout(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Vercel ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}
async function vercelPost(token: string, path: string, body: any) {
  const res = await fetchWithTimeout(`https://api.vercel.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Vercel ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}
async function vercelDelete(token: string, path: string) {
  const res = await fetchWithTimeout(`https://api.vercel.com${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Vercel ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

export const listVercelProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      token: z.string().min(10).max(500).optional(),
      workspaceId: z.string().uuid().optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let token = data.token;
    if (!token && data.workspaceId) {
      const s = await getWorkspaceSecrets(supabase, data.workspaceId);
      token = s.vercel_token ?? undefined;
    }
    if (!token) throw new Error("No Vercel token");
    const j = await vercelGet(token, "/v9/projects?limit=100");
    return {
      projects: (j.projects ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        framework: p.framework,
      })),
    };
  });

export const saveVercelConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      token: z.string().min(10).max(500),
      projectId: z.string().min(1).max(200),
      projectName: z.string().min(1).max(200),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("workspaces")
      .update({
        vercel_token: data.token,
        vercel_project_id: data.projectId,
        vercel_project_name: data.projectName,
      })
      .eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getVercelDeployments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.vercel_token || !ws.vercel_project_id) throw new Error("Vercel not connected");
    const j = await vercelGet(
      ws.vercel_token,
      `/v6/deployments?projectId=${encodeURIComponent(ws.vercel_project_id)}&limit=10`
    );
    return {
      deployments: (j.deployments ?? []).map((d: any) => ({
        id: d.uid,
        url: d.url ? `https://${d.url}` : null,
        state: d.state ?? d.readyState,
        created: d.created,
        ready: d.ready,
        target: d.target,
        branch: d.meta?.githubCommitRef ?? d.meta?.branch ?? null,
        commitMessage: d.meta?.githubCommitMessage ?? null,
        commitSha: d.meta?.githubCommitSha ?? null,
      })),
    };
  });

export const triggerVercelDeploy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.vercel_token || !ws.vercel_project_id) throw new Error("Vercel not connected");
    // Get most recent deployment to redeploy from
    const list = await vercelGet(
      ws.vercel_token,
      `/v6/deployments?projectId=${encodeURIComponent(ws.vercel_project_id)}&limit=1&target=production`
    );
    const latest = list.deployments?.[0];
    if (!latest) throw new Error("No previous deployment to redeploy");
    const j = await vercelPost(ws.vercel_token, `/v13/deployments`, {
      name: ws.vercel_project_name,
      deploymentId: latest.uid,
      target: "production",
    });
    return { id: j.id, url: j.url ? `https://${j.url}` : null };
  });

export const getVercelBuildLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      deploymentId: z.string().min(1).max(200),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.vercel_token) throw new Error("Vercel not connected");
    const res = await fetchWithTimeout(
      `https://api.vercel.com/v2/deployments/${encodeURIComponent(data.deploymentId)}/events`,
      { headers: { Authorization: `Bearer ${ws.vercel_token}` } }
    );
    if (!res.ok) throw new Error(`Vercel logs ${res.status}`);
    const events = await res.json();
    return {
      lines: (Array.isArray(events) ? events : [])
        .map((e: any) => ({
          ts: e.created ?? Date.now(),
          type: e.type,
          text: e.payload?.text ?? e.text ?? "",
        }))
        .filter((e: any) => e.text),
    };
  });

export const getVercelEnvVars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.vercel_token || !ws.vercel_project_id) throw new Error("Vercel not connected");
    const j = await vercelGet(
      ws.vercel_token,
      `/v9/projects/${encodeURIComponent(ws.vercel_project_id)}/env`
    );
    return {
      envs: (j.envs ?? []).map((e: any) => ({
        id: e.id,
        key: e.key,
        target: e.target,
        type: e.type,
      })),
    };
  });

export const addVercelEnvVar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      key: z.string().min(1).max(200).regex(/^[A-Z0-9_]+$/, "Use UPPER_SNAKE_CASE"),
      value: z.string().min(1).max(10000),
      target: z.array(z.enum(["production", "preview", "development"])).min(1),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.vercel_token || !ws.vercel_project_id) throw new Error("Vercel not connected");
    await vercelPost(
      ws.vercel_token,
      `/v10/projects/${encodeURIComponent(ws.vercel_project_id)}/env`,
      { key: data.key, value: data.value, target: data.target, type: "encrypted" }
    );
    return { ok: true };
  });

export const deleteVercelEnvVar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      envId: z.string().min(1).max(200),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.vercel_token || !ws.vercel_project_id) throw new Error("Vercel not connected");
    await vercelDelete(
      ws.vercel_token,
      `/v9/projects/${encodeURIComponent(ws.vercel_project_id)}/env/${encodeURIComponent(data.envId)}`
    );
    return { ok: true };
  });

/* =====================================================
   USER'S SUPABASE PROJECT (remote, via their service key)
   ===================================================== */

function sbHeaders(serviceKey: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
  };
}

export const testSupabaseConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      url: z.string().url().max(500),
      serviceKey: z.string().min(20).max(2000),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    try {
      const base = data.url.replace(/\/$/, "");
      const res = await fetchWithTimeout(`${base}/auth/v1/admin/users?page=1&per_page=1`, {
        headers: sbHeaders(data.serviceKey),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return { success: false as const, error: `${res.status}: ${txt.slice(0, 200)}` };
      }
      return { success: true as const };
    } catch (e: any) {
      return { success: false as const, error: e?.message ?? "Failed" };
    }
  });

export const saveSupabaseConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      url: z.string().url().max(500),
      serviceKey: z.string().min(20).max(2000),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    await assertWorkspaceAccess(supabase, data.workspaceId);
    const base = data.url.replace(/\/$/, "");
    await upsertWorkspaceSecrets(data.workspaceId, {
      supabase_url: base,
      supabase_service_key: data.serviceKey,
    });
    return { ok: true };
  });

async function getRemoteSb(supabase: any, workspaceId: string) {
  const s = await getWorkspaceSecrets(supabase, workspaceId);
  if (!s.supabase_url || !s.supabase_service_key) throw new Error("Supabase not connected");
  return { base: s.supabase_url.replace(/\/$/, ""), key: s.supabase_service_key };
}

async function runRemoteSql(base: string, key: string, sql: string) {
  // Requires user to have created an exec_sql RPC in their project.
  const res = await fetchWithTimeout(`${base}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: sbHeaders(key),
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        "exec_sql RPC not found in your Supabase project. Create it (see setup instructions) and try again."
      );
    }
    throw new Error(`SQL error ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const getSupabaseReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { base, key } = await getRemoteSb(supabase, data.workspaceId);

    // Auth users (count + recent)
    let userCount = 0;
    let recentUsers: any[] = [];
    let signupsToday = 0;
    try {
      const usersRes = await fetchWithTimeout(`${base}/auth/v1/admin/users?page=1&per_page=10`, {
        headers: sbHeaders(key),
      });
      const j = await usersRes.json();
      recentUsers = (j.users ?? []).map((u: any) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      }));
      userCount = j.total ?? recentUsers.length;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      signupsToday = recentUsers.filter((u) => new Date(u.created_at) >= today).length;
    } catch (e) {
      // ignore
    }

    // Tables + db size (requires exec_sql)
    let tables: any[] = [];
    let dbSize: string | null = null;
    try {
      const r = await runRemoteSql(
        base,
        key,
        `SELECT json_build_object(
          'tables', (SELECT json_agg(t) FROM (
            SELECT c.relname AS name,
              pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
              c.reltuples::bigint AS row_estimate
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind = 'r' AND n.nspname = 'public'
            ORDER BY c.relname
          ) t),
          'db_size', pg_size_pretty(pg_database_size(current_database()))
        ) AS report;`
      );
      const row = Array.isArray(r) ? r[0] : r;
      const rep = row?.report ?? row;
      tables = rep?.tables ?? [];
      dbSize = rep?.db_size ?? null;
    } catch (e: any) {
      return {
        userCount,
        signupsToday,
        recentUsers,
        tables: [],
        dbSize: null,
        sqlError: e?.message ?? "exec_sql unavailable",
      };
    }

    return { userCount, signupsToday, recentUsers, tables, dbSize, sqlError: null };
  });

export const getSupabaseTableData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      table: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_]+$/),
      page: z.number().int().min(0).max(10000).default(0),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { base, key } = await getRemoteSb(supabase, data.workspaceId);
    const offset = data.page * 50;
    const res = await fetchWithTimeout(
      `${base}/rest/v1/${encodeURIComponent(data.table)}?select=*&limit=50&offset=${offset}`,
      { headers: { ...sbHeaders(key), Prefer: "count=exact" } }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${res.status}: ${txt.slice(0, 200)}`);
    }
    const rows = await res.json();
    const cr = res.headers.get("content-range") ?? "";
    const totalMatch = cr.match(/\/(\d+|\*)$/);
    const total = totalMatch && totalMatch[1] !== "*" ? Number(totalMatch[1]) : rows.length;
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { rows, columns, total };
  });

export const runSupabaseQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      sql: z.string().min(1).max(20000),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { base, key } = await getRemoteSb(supabase, data.workspaceId);
    try {
      const result = await runRemoteSql(base, key, data.sql);
      return { ok: true as const, result };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "Failed" };
    }
  });

export const getSupabaseAuthLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { base, key } = await getRemoteSb(supabase, data.workspaceId);
    try {
      const r = await runRemoteSql(
        base,
        key,
        `SELECT created_at, payload->>'action' AS action,
                payload->'actor'->>'email' AS email,
                payload->>'log_type' AS log_type
         FROM auth.audit_log_entries
         ORDER BY created_at DESC
         LIMIT 20;`
      );
      return { logs: Array.isArray(r) ? r : [] };
    } catch (e: any) {
      return { logs: [], error: e?.message ?? "Failed" };
    }
  });

export const insertSupabaseRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      table: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_]+$/),
      row: z.record(z.string(), z.any()),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { base, key } = await getRemoteSb(supabase, data.workspaceId);
    const res = await fetchWithTimeout(`${base}/rest/v1/${encodeURIComponent(data.table)}`, {
      method: "POST",
      headers: { ...sbHeaders(key), Prefer: "return=representation" },
      body: JSON.stringify(data.row),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${res.status}: ${txt.slice(0, 300)}`);
    }
    return { ok: true, row: await res.json() };
  });

export const deleteSupabaseRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      table: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_]+$/),
      idColumn: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_]+$/),
      idValue: z.union([z.string(), z.number()]),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { base, key } = await getRemoteSb(supabase, data.workspaceId);
    const res = await fetchWithTimeout(
      `${base}/rest/v1/${encodeURIComponent(data.table)}?${encodeURIComponent(data.idColumn)}=eq.${encodeURIComponent(String(data.idValue))}`,
      { method: "DELETE", headers: sbHeaders(key) }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${res.status}: ${txt.slice(0, 200)}`);
    }
    return { ok: true };
  });

/* =====================================================
   DOMAIN
   ===================================================== */

export const checkDomainLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.godaddy_domain) throw new Error("No domain set");
    const domain = ws.godaddy_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const now = new Date().toISOString();
    try {
      const res = await fetchWithTimeout(`https://${domain}`, {}, 5000);
      await supabase
        .from("workspaces")
        .update({ domain_last_checked_at: now, domain_last_status: res.status })
        .eq("id", data.workspaceId);
      return { live: res.status < 400, status: res.status, checkedAt: now };
    } catch (e: any) {
      await supabase
        .from("workspaces")
        .update({ domain_last_checked_at: now, domain_last_status: 0 })
        .eq("id", data.workspaceId);
      return { live: false, status: 0, checkedAt: now, error: e?.message ?? "Unreachable" };
    }
  });

/* =====================================================
   SETUP PROGRESS
   ===================================================== */

export const updateSetupProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      key: z.enum(["github", "vercel", "supabase", "domain"]),
      step: z.number().int().min(0).max(10),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    const progress = { ...(ws.setup_progress ?? {}), [data.key]: data.step };
    const { error } = await supabase
      .from("workspaces")
      .update({ setup_progress: progress })
      .eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { progress };
  });

export const saveWorkspaceDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      domain: z.string().min(3).max(255).regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, "Invalid domain"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("workspaces")
      .update({ godaddy_domain: data.domain.toLowerCase() })
      .eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveWorkspaceRepo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      repo: z.string().min(3).max(200).regex(/^[\w.-]+\/[\w.-]+$/, "Use owner/repo"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("workspaces")
      .update({ github_repo: data.repo })
      .eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =====================================================
   GITHUB (repo browsing via user's PAT in profiles)
   ===================================================== */

async function getUserGithubToken(supabase: any, userId: string, workspaceId: string): Promise<string> {
  // Try requester first (token lives in profile_secrets, not profiles)
  const mine = await getProfileSecrets(userId);
  if (mine?.github_token) return mine.github_token;
  // Fallback to workspace owner
  const { data: ws } = await supabase.from("workspaces").select("created_by").eq("id", workspaceId).single();
  if (ws?.created_by && ws.created_by !== userId) {
    const own = await getProfileSecrets(ws.created_by);
    if (own?.github_token) return own.github_token;
  }
  throw new Error("No GitHub token configured. Set one in Settings.");
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "YoFounder",
  };
}

async function ghFetch(token: string, path: string, init: RequestInit = {}) {
  const res = await fetchWithTimeout(`https://api.github.com${path}`, {
    ...init,
    headers: { ...ghHeaders(token), ...(init.headers || {}) },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

export const listGithubRepos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const token = await getUserGithubToken(supabase, userId, data.workspaceId);
    const repos = await ghFetch(token, "/user/repos?sort=updated&per_page=50");
    return {
      repos: (Array.isArray(repos) ? repos : []).map((r: any) => ({
        full_name: r.full_name,
        private: r.private,
        updated_at: r.updated_at,
        description: r.description ?? null,
      })),
    };
  });

export const getGithubRepoInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.github_repo) throw new Error("No repo connected");
    const token = await getUserGithubToken(supabase, userId, data.workspaceId);
    const r = await ghFetch(token, `/repos/${ws.github_repo}`);
    return {
      full_name: r.full_name,
      description: r.description,
      private: r.private,
      default_branch: r.default_branch,
      html_url: r.html_url,
      stargazers_count: r.stargazers_count,
      forks_count: r.forks_count,
      open_issues_count: r.open_issues_count,
      updated_at: r.updated_at,
    };
  });

export const getGithubPRs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.github_repo) throw new Error("No repo connected");
    const token = await getUserGithubToken(supabase, userId, data.workspaceId);
    const prs = await ghFetch(token, `/repos/${ws.github_repo}/pulls?state=open&per_page=20`);
    return {
      prs: (Array.isArray(prs) ? prs : []).map((p: any) => ({
        number: p.number,
        title: p.title,
        author: p.user?.login ?? "unknown",
        head: p.head?.ref ?? "",
        base: p.base?.ref ?? "main",
        html_url: p.html_url,
        created_at: p.created_at,
        changed_files: p.changed_files ?? null,
      })),
    };
  });

export const getGithubCommits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.github_repo) throw new Error("No repo connected");
    const token = await getUserGithubToken(supabase, userId, data.workspaceId);
    const commits = await ghFetch(token, `/repos/${ws.github_repo}/commits?per_page=10`);
    return {
      commits: (Array.isArray(commits) ? commits : []).map((c: any) => ({
        sha: c.sha,
        short_sha: c.sha?.slice(0, 7),
        message: c.commit?.message?.split("\n")[0] ?? "",
        author: c.commit?.author?.name ?? c.author?.login ?? "unknown",
        date: c.commit?.author?.date,
        html_url: c.html_url,
      })),
    };
  });

export const listGithubRepoFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      path: z.string().max(500).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.github_repo) throw new Error("No repo connected");
    const token = await getUserGithubToken(supabase, userId, data.workspaceId);
    const safePath = (data.path ?? "").replace(/^\/+|\/+$/g, "");
    const url = safePath
      ? `/repos/${ws.github_repo}/contents/${encodeURI(safePath)}`
      : `/repos/${ws.github_repo}/contents`;
    const res = await ghFetch(token, url);
    const items = Array.isArray(res) ? res : [];
    return {
      path: safePath,
      entries: items.map((e: any) => ({
        name: e.name,
        path: e.path,
        type: e.type as "file" | "dir",
        size: e.size ?? 0,
        html_url: e.html_url ?? null,
      })).sort((a: any, b: any) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    };
  });

export const getGithubPRDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      prNumber: z.number().int().min(1).max(1_000_000),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.github_repo) throw new Error("No repo connected");
    const token = await getUserGithubToken(supabase, userId, data.workspaceId);
    const [pr, files] = await Promise.all([
      ghFetch(token, `/repos/${ws.github_repo}/pulls/${data.prNumber}`),
      ghFetch(token, `/repos/${ws.github_repo}/pulls/${data.prNumber}/files?per_page=50`),
    ]);
    return {
      body: pr?.body ?? "",
      changed_files: pr?.changed_files ?? null,
      files: (Array.isArray(files) ? files : []).map((f: any) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
      })),
    };
  });

export const mergeGithubPR = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      prNumber: z.number().int().min(1).max(1_000_000),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.github_repo) throw new Error("No repo connected");
    const token = await getUserGithubToken(supabase, userId, data.workspaceId);
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${ws.github_repo}/pulls/${data.prNumber}/merge`,
      { method: "PUT", headers: ghHeaders(token), body: JSON.stringify({}) }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`GitHub ${res.status}: ${txt.slice(0, 200)}`);
    }
    const j = await res.json();
    return { merged: !!j.merged, sha: j.sha ?? null };
  });

/* =====================================================
   RUN CODE CHANGE (GitHub API + Claude)
   ===================================================== */

function b64encode(s: string): string {
  // Edge-runtime safe base64 of utf8 string
  if (typeof Buffer !== "undefined") return Buffer.from(s, "utf8").toString("base64");
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // @ts-ignore
  return btoa(bin);
}
function b64decode(s: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(s, "base64").toString("utf8");
  // @ts-ignore
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function scorePathForPrompt(path: string, promptLc: string): number {
  let score = 0;
  const lc = path.toLowerCase();
  if (lc.startsWith("src/")) score += 10;
  if (lc.includes("/components/")) score += 4;
  if (lc.includes("/routes/")) score += 4;
  if (/\.(tsx?|jsx?|css|md|json)$/.test(lc)) score += 3;
  if (/(test|spec|node_modules|dist|build|\.lock)/.test(lc)) score -= 50;
  // keyword bias
  for (const w of promptLc.split(/[^a-z0-9]+/).filter((w) => w.length > 3)) {
    if (lc.includes(w)) score += 6;
  }
  return score;
}

async function callClaudeRaw(apiKey: string, system: string, userText: string, maxTokens: number): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userText }],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Claude API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error("Claude returned no text");
    return text as string;
  } finally {
    clearTimeout(t);
  }
}

async function callOpenAIRaw(apiKey: string, system: string, userText: string, maxTokens: number): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userText },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenAI returned no text");
    return text as string;
  } finally {
    clearTimeout(t);
  }
}

async function callGeminiRaw(apiKey: string, system: string, userText: string, maxTokens: number): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `System: ${system}\n\nUser: ${userText}` }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no text");
    return text as string;
  } finally {
    clearTimeout(t);
  }
}

async function callAIRaw(provider: "claude" | "gpt" | "gemini", apiKey: string, system: string, userText: string, maxTokens: number) {
  if (provider === "claude") return callClaudeRaw(apiKey, system, userText, maxTokens);
  if (provider === "gpt") return callOpenAIRaw(apiKey, system, userText, maxTokens);
  // Gemini: fall back to server GEMINI_API_KEY if user didn't provide one
  const key = apiKey || process.env.GEMINI_API_KEY || "";
  if (!key) throw new Error("Gemini key is missing");
  return callGeminiRaw(key, system, userText, maxTokens);
}

export const runClaudeCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      promptId: z.string().uuid(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const ws = await getWorkspace(supabase, data.workspaceId);

    // Rate limit
    const { data: active } = await supabase
      .from("claude_code_jobs")
      .select("id, status")
      .eq("workspace_id", data.workspaceId)
      .in("status", ["queued", "reading", "coding", "committing"])
      .limit(1);
    if ((active ?? []).length > 0) {
      throw new Error("A change is already in progress for this workspace");
    }

    const { data: prompt, error: pErr } = await supabase
      .from("prompts").select("id, title, content").eq("id", data.promptId).single();
    if (pErr || !prompt) throw new Error("Prompt not found");

    // Use YoFounder's server-side keys — users don't need to bring their own
    const secrets = await getProfileSecrets(userId).catch(() => ({} as any));
    let provider: "claude" | "gpt" | "gemini";
    let aiKey: string | null;
    if (process.env.ANTHROPIC_API_KEY) {
      provider = "claude"; aiKey = process.env.ANTHROPIC_API_KEY;
    } else if (process.env.OPENAI_API_KEY) {
      provider = "gpt"; aiKey = process.env.OPENAI_API_KEY;
    } else if (process.env.GEMINI_API_KEY) {
      provider = "gemini"; aiKey = process.env.GEMINI_API_KEY;
    } else {
      throw new Error("No server AI key configured. Add ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY to YoFounder secrets.");
    }

    // GitHub is OPTIONAL — only used when a repo is connected
    let token: string | null = secrets.github_token ?? null;
    if (!token && ws.created_by && ws.created_by !== userId) {
      const ownerSecrets = await getProfileSecrets(ws.created_by);
      token = ownerSecrets.github_token ?? null;
    }
    const hasGithub = !!(ws.github_repo && token);

    const slug = (prompt.title || "change").toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "change";
    const branch = hasGithub ? `yofounder/${slug}-${Date.now()}` : "";

    const { data: job, error: jErr } = await supabase
      .from("claude_code_jobs")
      .insert({
        workspace_id: data.workspaceId,
        proposal_id: prompt.id,
        triggered_by: userId,
        status: "queued",
        branch_name: branch || null,
      })
      .select()
      .single();
    if (jErr || !job) throw new Error(jErr?.message ?? "Failed to create job");

    const work = (async () => {
      const setStatus = async (status: string, fields: Record<string, any> = {}) => {
        await supabase.from("claude_code_jobs").update({ status, updated_at: new Date().toISOString(), ...fields }).eq("id", job.id);
      };
      const fail = async (msg: string) => {
        await setStatus("failed", { error: msg, last_message: null });
      };

      try {
        let codeContext = "";

        if (hasGithub) {
          await setStatus("reading", { last_message: "Reading your code from GitHub" });
          const repo = ws.github_repo as string;
          const baseBranch = ws.github_branch || "main";
          const ghHead = ghHeaders(token!);

          const refRes = await fetchWithTimeout(`https://api.github.com/repos/${repo}/git/ref/heads/${baseBranch}`, { headers: ghHead });
          if (!refRes.ok) { await fail(`Couldn't find branch ${baseBranch}`); return; }
          const refJson = await refRes.json();
          const baseSha = refJson.object.sha as string;

          const treeRes = await fetchWithTimeout(`https://api.github.com/repos/${repo}/git/trees/${baseSha}?recursive=1`, { headers: ghHead });
          if (!treeRes.ok) { await fail("Couldn't read the file list"); return; }
          const treeJson = await treeRes.json();
          const blobs: { path: string; sha: string }[] = (treeJson.tree ?? [])
            .filter((n: any) => n.type === "blob")
            .map((n: any) => ({ path: n.path, sha: n.sha }));

          const promptLc = `${prompt.title} ${prompt.content}`.toLowerCase();
          const ranked = blobs
            .map((b) => ({ ...b, score: scorePathForPrompt(b.path, promptLc) }))
            .filter((b) => b.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

          const files: { path: string; sha: string; content: string }[] = [];
          for (const f of ranked) {
            try {
              const c = await fetchWithTimeout(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(f.path)}?ref=${encodeURIComponent(baseBranch)}`, { headers: ghHead });
              if (!c.ok) continue;
              const j = await c.json();
              const text = j.encoding === "base64" ? b64decode((j.content || "").replace(/\n/g, "")) : "";
              if (text && text.length < 80_000) {
                files.push({ path: f.path, sha: j.sha, content: text });
              }
            } catch {}
          }
          codeContext = files.map((f) => `// FILE: ${f.path}\n${f.content}`).join("\n\n========\n\n");
        }

        await setStatus("coding", { last_message: "Generating code with AI" });

        const system = `You are an expert software engineer building a React + TypeScript + Tailwind app. Implement the requested change and return the new/modified files as JSON.

Return ONLY a JSON array of files:
[
  { "path": "src/components/Example.tsx", "content": "full file content here" }
]

Return valid JSON only — no explanation, no markdown fences.`;
        const userText = hasGithub
          ? `Existing codebase files:\n\n${codeContext}\n\nTask: ${prompt.title}\n\n${prompt.content}`
          : `Task: ${prompt.title}\n\n${prompt.content}\n\nThere is no existing codebase to read — generate fresh, complete files for this change.`;

        const raw = await callAIRaw(provider, aiKey!, system, userText, 4000);
        let cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
        let changes: { path: string; content: string }[];
        try {
          changes = JSON.parse(cleaned);
        } catch {
          const m = cleaned.match(/\[[\s\S]*\]/);
          if (!m) throw new Error("AI didn't return valid JSON");
          changes = JSON.parse(m[0]);
        }
        if (!Array.isArray(changes) || changes.length === 0) {
          await fail("No file changes were proposed");
          return;
        }

        // NO GITHUB → save generated files inline on the prompt and finish
        if (!hasGithub) {
          const summary = changes.map((c) => `### ${c.path}\n\n\`\`\`\n${c.content}\n\`\`\``).join("\n\n");
          await setStatus("pr_opened", { last_message: `Generated ${changes.length} file(s) — connect GitHub in Settings to push them` });
          await supabase.from("prompts").update({
            status: "pr_opened",
            files_affected: changes.map((c) => c.path).filter(Boolean),
            summary,
            next_steps: [
              "Review the generated code below",
              "Copy the files into your project, or connect GitHub in Settings to push automatically",
            ],
            claude_code_job_id: job.id,
          }).eq("id", prompt.id);
          return;
        }

        // GITHUB FLOW
        await setStatus("committing", { last_message: `Saving ${changes.length} file change(s) to a new version` });
        const repo = ws.github_repo as string;
        const baseBranch = ws.github_branch || "main";
        const ghHead = ghHeaders(token!);
        const refRes = await fetchWithTimeout(`https://api.github.com/repos/${repo}/git/ref/heads/${baseBranch}`, { headers: ghHead });
        const baseSha = (await refRes.json()).object.sha as string;

        const newRefRes = await fetchWithTimeout(`https://api.github.com/repos/${repo}/git/refs`, {
          method: "POST",
          headers: { ...ghHead, "content-type": "application/json" },
          body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
        });
        if (!newRefRes.ok) {
          const t = await newRefRes.text().catch(() => "");
          await fail(`Could not create new version: ${t.slice(0, 200)}`);
          return;
        }

        for (const ch of changes) {
          if (!ch.path || typeof ch.content !== "string") continue;
          let existingSha: string | undefined;
          const cur = await fetchWithTimeout(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(ch.path)}?ref=${encodeURIComponent(branch)}`, { headers: ghHead });
          if (cur.ok) {
            const j = await cur.json().catch(() => null);
            if (j && j.sha) existingSha = j.sha;
          }
          const putRes = await fetchWithTimeout(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(ch.path)}`, {
            method: "PUT",
            headers: { ...ghHead, "content-type": "application/json" },
            body: JSON.stringify({
              message: `[YoFounder] ${prompt.title}`,
              content: b64encode(ch.content),
              branch,
              ...(existingSha ? { sha: existingSha } : {}),
            }),
          });
          if (!putRes.ok) {
            const t = await putRes.text().catch(() => "");
            await fail(`Couldn't save ${ch.path}: ${t.slice(0, 200)}`);
            return;
          }
        }

        await setStatus("committing", { last_message: "Sending changes for review" });

        const prRes = await fetchWithTimeout(`https://api.github.com/repos/${repo}/pulls`, {
          method: "POST",
          headers: { ...ghHead, "content-type": "application/json" },
          body: JSON.stringify({
            title: `[YoFounder] ${prompt.title}`,
            body: `Changes implemented by YoFounder AI\n\n${prompt.content}`,
            head: branch,
            base: baseBranch,
          }),
        });
        if (!prRes.ok) {
          const t = await prRes.text().catch(() => "");
          await fail(`Couldn't open change request: ${t.slice(0, 200)}`);
          return;
        }
        const pr = await prRes.json();
        await setStatus("pr_opened", {
          last_message: "Done — your change request is ready to review",
          pr_url: pr.html_url,
          pr_number: pr.number,
        });

        await supabase.from("prompts").update({
          status: "pr_opened",
          github_issue_url: pr.html_url,
          github_issue_number: pr.number,
          claude_code_job_id: job.id,
          files_affected: changes.map((c) => c.path).filter(Boolean),
          summary: `Updated ${changes.length} file${changes.length === 1 ? "" : "s"} based on your request.`,
          next_steps: [
            "Review the changes in the Diff tab",
            "Preview them live once the deployment is ready",
            "Approve to push the update to your codebase",
          ],
        }).eq("id", prompt.id);
      } catch (e: any) {
        await fail(e?.message ?? "Something went wrong");
      }
    })();

    await Promise.race([work, new Promise((r) => setTimeout(r, 1500))]);

    return { jobId: job.id as string, branch };
  });


/* =====================================================
   CODE TAB: repo tree, file content, PR close, vercel preview
   ===================================================== */

export const getRepoTree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.github_repo) throw new Error("No repo connected");
    const token = await getUserGithubToken(supabase, userId, data.workspaceId);
    const branch = ws.github_branch || "main";
    const refJ = await ghFetch(token, `/repos/${ws.github_repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    const sha = refJ?.object?.sha;
    if (!sha) throw new Error("Branch not found");
    const tree = await ghFetch(token, `/repos/${ws.github_repo}/git/trees/${sha}?recursive=1`);
    const nodes = (tree?.tree ?? []).map((n: any) => ({
      path: n.path as string,
      type: n.type as "blob" | "tree",
      size: n.size ?? null,
    }));
    return { branch, nodes };
  });

export const getRepoFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      path: z.string().min(1).max(500),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.github_repo) throw new Error("No repo connected");
    const token = await getUserGithubToken(supabase, userId, data.workspaceId);
    const branch = ws.github_branch || "main";
    const j = await ghFetch(
      token,
      `/repos/${ws.github_repo}/contents/${encodeURIComponent(data.path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(branch)}`
    );
    if (j.encoding !== "base64") return { path: data.path, content: "", lines: 0, size: j.size ?? 0 };
    const content = b64decode((j.content || "").replace(/\n/g, ""));
    return {
      path: data.path,
      content,
      lines: content.split("\n").length,
      size: j.size ?? content.length,
    };
  });

export const closeGithubPR = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      promptId: z.string().uuid(),
      prNumber: z.number().int().min(1).max(1_000_000),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.github_repo) throw new Error("No repo connected");
    const token = await getUserGithubToken(supabase, userId, data.workspaceId);
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${ws.github_repo}/pulls/${data.prNumber}`,
      {
        method: "PATCH",
        headers: { ...ghHeaders(token), "content-type": "application/json" },
        body: JSON.stringify({ state: "closed" }),
      }
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`GitHub ${res.status}: ${t.slice(0, 200)}`);
    }
    await supabase
      .from("prompts")
      .update({ status: "draft", github_issue_url: null, github_issue_number: null })
      .eq("id", data.promptId);
    return { ok: true };
  });

export const approveAndPushPR = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      promptId: z.string().uuid(),
      prNumber: z.number().int().min(1).max(1_000_000),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.github_repo) throw new Error("No repo connected");
    const token = await getUserGithubToken(supabase, userId, data.workspaceId);
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${ws.github_repo}/pulls/${data.prNumber}/merge`,
      { method: "PUT", headers: { ...ghHeaders(token), "content-type": "application/json" }, body: JSON.stringify({ merge_method: "squash" }) }
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`GitHub ${res.status}: ${t.slice(0, 200)}`);
    }
    const j = await res.json();

    // Try to fetch a fresh Vercel preview URL (non-blocking — best effort)
    let previewUrl: string | null = null;
    try {
      if (ws.vercel_token && ws.vercel_project_id) {
        const vj = await vercelGet(
          ws.vercel_token,
          `/v6/deployments?projectId=${encodeURIComponent(ws.vercel_project_id)}&limit=1`
        );
        const d = vj.deployments?.[0];
        if (d?.url) previewUrl = `https://${d.url}`;
      }
    } catch {
      // ignore — preview fetch is best-effort
    }

    await supabase
      .from("prompts")
      .update({
        status: "deployed",
        vercel_preview_url: previewUrl,
      })
      .eq("id", data.promptId);

    return { merged: !!j.merged, sha: j.sha ?? null, previewUrl };
  });

export const fetchVercelPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      promptId: z.string().uuid(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const ws = await getWorkspace(supabase, data.workspaceId);
    if (!ws.vercel_token || !ws.vercel_project_id) {
      return { url: null as string | null, configured: false };
    }
    const j = await vercelGet(
      ws.vercel_token,
      `/v6/deployments?projectId=${encodeURIComponent(ws.vercel_project_id)}&limit=1`
    );
    const d = j.deployments?.[0];
    const url = d?.url ? `https://${d.url}` : null;
    if (url) {
      await supabase.from("prompts").update({ vercel_preview_url: url }).eq("id", data.promptId);
    }
    return { url, configured: true };
  });

// ---------- Generate UI Preview HTML using server-side OpenAI key ----------
export const generateUiPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ promptId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: prompt, error } = await supabase
      .from("prompts").select("id, title, content").eq("id", data.promptId).single();
    if (error || !prompt) throw new Error("Prompt not found");

    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    const system = `You are a senior UI designer. Generate a single self-contained HTML document that visually mocks up the UI described below. Requirements:
- Use only inline <style> + Tailwind CDN (<script src="https://cdn.tailwindcss.com"></script>).
- Beautiful, modern, polished design (think Lovable / Linear / Vercel aesthetic).
- Include realistic sample content (not lorem ipsum).
- Fully responsive.
- Return ONLY the raw HTML document starting with <!DOCTYPE html>. No markdown fences, no commentary.`;

    const userText = `Title: ${prompt.title}\n\nDescription / requested change:\n${prompt.content}\n\nGenerate the HTML mockup now.`;

    let html: string;
    if (openaiKey) {
      html = await callOpenAIRaw(openaiKey, system, userText, 6000);
    } else if (anthropicKey) {
      html = await callClaudeRaw(anthropicKey, system, userText, 6000);
    } else if (geminiKey) {
      html = await callGeminiRaw(geminiKey, system, userText, 6000);
    } else {
      throw new Error("No AI key configured on the server for UI preview generation.");
    }

    html = html.trim().replace(/^```html\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
    if (!/^<!doctype html/i.test(html) && !/^<html/i.test(html)) {
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"></script></head><body>${html}</body></html>`;
    }

    await supabase.from("prompts").update({ ui_preview_html: html }).eq("id", data.promptId);
    return { html };
  });
