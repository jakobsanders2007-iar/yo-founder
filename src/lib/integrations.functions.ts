import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      const ws = await getWorkspace(supabase, data.workspaceId);
      token = ws.vercel_token;
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
    const base = data.url.replace(/\/$/, "");
    const { error } = await supabase
      .from("workspaces")
      .update({ supabase_url: base, supabase_service_key: data.serviceKey })
      .eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function getRemoteSb(supabase: any, workspaceId: string) {
  const ws = await getWorkspace(supabase, workspaceId);
  if (!ws.supabase_url || !ws.supabase_service_key) throw new Error("Supabase not connected");
  return { base: ws.supabase_url.replace(/\/$/, ""), key: ws.supabase_service_key };
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
  // Try requester first
  const { data: me } = await supabase.from("profiles").select("github_token").eq("id", userId).single();
  if (me?.github_token) return me.github_token;
  // Fallback to workspace owner
  const { data: ws } = await supabase.from("workspaces").select("created_by").eq("id", workspaceId).single();
  if (ws?.created_by) {
    const { data: own } = await supabase.from("profiles").select("github_token").eq("id", ws.created_by).single();
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
