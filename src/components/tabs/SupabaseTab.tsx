import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/Card";
import { SetupStep } from "@/components/tabs/GithubTab";
import { ExternalLink, Eye, EyeOff, Check, RefreshCw, Trash2, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  testSupabaseConnection, saveSupabaseConnection, getSupabaseReport,
  getSupabaseTableData, runSupabaseQuery, getSupabaseAuthLogs,
  deleteSupabaseRow, insertSupabaseRow, updateSetupProgress,
} from "@/lib/integrations.functions";

const EXEC_SQL_SETUP = `-- Run this once in your Supabase SQL editor
create or replace function public.exec_sql(query text)
returns jsonb
language plpgsql
security definer
as $$
declare result jsonb;
begin
  execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || query || ') t' into result;
  return result;
exception when others then
  return jsonb_build_object('error', SQLERRM);
end;
$$;
revoke all on function public.exec_sql(text) from public, anon, authenticated;`;

export function SupabaseTab({ ws, onWsUpdate }: { ws: any; onWsUpdate: () => void }) {
  const connected = !!ws.supabase_url && !!ws.supabase_service_key;
  if (!connected) return <SupabaseSetup ws={ws} onWsUpdate={onWsUpdate} />;
  return <SupabaseDashboard ws={ws} />;
}

function SupabaseSetup({ ws, onWsUpdate }: { ws: any; onWsUpdate: () => void }) {
  const test = useServerFn(testSupabaseConnection);
  const save = useServerFn(saveSupabaseConnection);
  const updateProg = useServerFn(updateSetupProgress);

  const step: number = ws.setup_progress?.supabase ?? 0;
  const setStep = async (n: number) => {
    await updateProg({ data: { workspaceId: ws.id, key: "supabase", step: n } });
    onWsUpdate();
  };

  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      const r = await test({ data: { url: url.trim(), serviceKey: key.trim() } });
      if (!r.success) throw new Error(r.error);
      await save({ data: { workspaceId: ws.id, url: url.trim(), serviceKey: key.trim() } });
      toast.success("Connected");
      await setStep(3);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="text-xs text-muted-foreground">
        Supabase is your app's database + auth. <span className="text-success">Free tier</span>: 500MB database, 50K monthly active users, unlimited API requests.
      </div>

      <SetupStep n={1} title="Create a Supabase account" done={step >= 1} active={step === 0}>
        <div className="flex gap-2">
          <a href="https://supabase.com" target="_blank" rel="noreferrer" onClick={() => setStep(1)}
            className="bg-brand text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:opacity-90 inline-flex items-center gap-1.5">
            Create Supabase Account <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button onClick={() => setStep(1)} className="px-4 py-2 border border-border rounded text-sm hover:border-foreground">
            I already have one
          </button>
        </div>
      </SetupStep>

      <SetupStep n={2} title="Create a new project" done={step >= 2} active={step === 1}>
        <ol className="text-sm space-y-2 mb-4 pl-5 list-decimal text-muted-foreground">
          <li>Click <span className="font-mono text-foreground">New Project</span> in your Supabase dashboard</li>
          <li>Give it a name and set a strong database password</li>
          <li>Choose the free tier region closest to you</li>
          <li>Wait ~2 minutes for it to provision</li>
        </ol>
        <button onClick={() => setStep(2)} className="px-4 py-2 border border-border rounded text-sm hover:border-foreground">
          My project is ready
        </button>
      </SetupStep>

      <SetupStep n={3} title="Get your project credentials" done={step >= 3} active={step === 2}>
        <ol className="text-sm space-y-2 mb-4 pl-5 list-decimal text-muted-foreground">
          <li>Open your project in Supabase</li>
          <li>Click <span className="font-mono text-foreground">Project Settings</span> in the left sidebar</li>
          <li>Click <span className="font-mono text-foreground">API</span> under Settings</li>
          <li>Copy <span className="font-mono text-foreground">Project URL</span> — paste below</li>
          <li>Copy <span className="font-mono text-foreground">service_role</span> key — paste below</li>
        </ol>
        <div className="space-y-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co"
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono" />
          <div className="relative">
            <input type={showKey ? "text" : "password"} value={key} onChange={(e) => setKey(e.target.value)} placeholder="service_role key"
              className="w-full bg-background border border-border rounded px-3 py-2 pr-9 text-sm font-mono" />
            <button onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button onClick={connect} disabled={busy || !url || !key}
            className="px-4 py-2 bg-brand text-primary-foreground rounded text-sm hover:opacity-90 disabled:opacity-50">
            {busy ? "Testing..." : "Test & Connect"}
          </button>
        </div>
      </SetupStep>

      <Card title="Optional: enable raw SQL queries">
        <p className="text-sm text-muted-foreground mb-3">
          To use the in-app SQL editor and stats, run this once in your Supabase project's SQL Editor:
        </p>
        <pre className="bg-background border border-border rounded p-3 text-[11px] font-mono overflow-x-auto">{EXEC_SQL_SETUP}</pre>
        <button onClick={() => { navigator.clipboard.writeText(EXEC_SQL_SETUP); toast.success("Copied"); }}
          className="mt-3 text-xs border border-border rounded px-3 py-1.5 hover:border-foreground">
          Copy SQL
        </button>
      </Card>
    </div>
  );
}

function SupabaseDashboard({ ws }: { ws: any }) {
  const getReport = useServerFn(getSupabaseReport);
  const getLogs = useServerFn(getSupabaseAuthLogs);

  const [report, setReport] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTable, setActiveTable] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [r, l] = await Promise.all([
          getReport({ data: { workspaceId: ws.id } }),
          getLogs({ data: { workspaceId: ws.id } }).catch(() => ({ logs: [] })),
        ]);
        setReport(r);
        setLogs(l.logs);
      } catch (e: any) {
        toast.error(e?.message ?? "Failed");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, [ws.id]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading Supabase…</div>;
  if (!report) return null;

  return (
    <div className="p-6 max-w-6xl space-y-6">
      {report.sqlError && (
        <div className="border border-warning/30 bg-warning/5 rounded p-4 flex gap-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Limited mode</div>
            <div className="text-muted-foreground text-xs mt-1">
              {report.sqlError} Some stats and the SQL editor are disabled until you create the exec_sql RPC (see Setup).
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total users" value={String(report.userCount)} />
        <Stat label="Signups today" value={String(report.signupsToday)} />
        <Stat label="Tables" value={String(report.tables?.length ?? 0)} />
        <Stat label="DB size" value={report.dbSize ?? "—"} />
      </div>

      <Card title="Recent signups">
        {report.recentUsers.length === 0 ? <p className="text-sm text-muted-foreground">No users yet.</p> : (
          <ul className="divide-y divide-border -mx-5">
            {report.recentUsers.map((u: any) => (
              <li key={u.id} className="px-5 py-2 flex items-center gap-3 text-sm">
                <span className="font-mono truncate flex-1">{u.email}</span>
                <span className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Tables">
          {report.tables.length === 0 ? <p className="text-sm text-muted-foreground">No tables.</p> : (
            <ul className="divide-y divide-border -mx-5">
              {report.tables.map((t: any) => (
                <li key={t.name}>
                  <button onClick={() => setActiveTable(t.name)}
                    className="w-full px-5 py-2 text-left text-sm hover:bg-background flex items-center gap-3">
                    <span className="font-mono flex-1">{t.name}</span>
                    <span className="text-xs text-muted-foreground">~{t.row_estimate} rows</span>
                    <span className="text-xs text-muted-foreground">{t.size}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent auth events">
          {logs.length === 0 ? <p className="text-sm text-muted-foreground">No events.</p> : (
            <ul className="divide-y divide-border -mx-5 max-h-80 overflow-y-auto scrollbar-thin">
              {logs.map((l: any, i) => (
                <li key={i} className="px-5 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{l.action}</span>
                    {l.email && <span className="text-muted-foreground truncate">{l.email}</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {activeTable && <TableViewer ws={ws} table={activeTable} onClose={() => setActiveTable(null)} />}

      <SqlEditor ws={ws} disabled={!!report.sqlError} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function TableViewer({ ws, table, onClose }: { ws: any; table: string; onClose: () => void }) {
  const fetchData = useServerFn(getSupabaseTableData);
  const del = useServerFn(deleteSupabaseRow);
  const ins = useServerFn(insertSupabaseRow);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: any[]; columns: string[]; total: number } | null>(null);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const r = await fetchData({ data: { workspaceId: ws.id, table, page } });
      setData(r);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [table, page]);

  const filtered = useMemo(() => {
    if (!data || !filter) return data?.rows ?? [];
    const q = filter.toLowerCase();
    return data.rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [data, filter]);

  const idCol = data?.columns.includes("id") ? "id" : data?.columns[0];

  return (
    <Card title={table} right={
      <div className="flex gap-2 items-center">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter..."
          className="bg-background border border-border rounded px-2 py-1 text-xs w-32" />
        <button onClick={() => setAdding(!adding)} className="text-xs border border-border rounded px-2 py-1 hover:border-foreground">+ Row</button>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
    }>
      {adding && data && (
        <div className="mb-3 p-3 border border-border rounded bg-background space-y-2">
          {data.columns.filter((c) => !["id", "created_at", "updated_at"].includes(c)).map((c) => (
            <div key={c} className="flex items-center gap-2">
              <label className="text-xs font-mono w-32 text-muted-foreground">{c}</label>
              <input value={newRow[c] ?? ""} onChange={(e) => setNewRow({ ...newRow, [c]: e.target.value })}
                className="flex-1 bg-surface border border-border rounded px-2 py-1 text-xs font-mono" />
            </div>
          ))}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setAdding(false); setNewRow({}); }} className="text-xs border border-border rounded px-3 py-1.5 hover:border-foreground">Cancel</button>
            <button onClick={async () => {
              try { await ins({ data: { workspaceId: ws.id, table, row: newRow } }); toast.success("Added"); setAdding(false); setNewRow({}); load(); }
              catch (e: any) { toast.error(e?.message ?? "Failed"); }
            }} className="text-xs bg-brand text-primary-foreground rounded px-3 py-1.5">Save</button>
          </div>
        </div>
      )}
      {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <div className="overflow-x-auto -mx-5 border-y border-border">
            <table className="w-full text-xs font-mono">
              <thead className="bg-background">
                <tr>
                  {data.columns.map((c) => <th key={c} className="px-3 py-2 text-left font-medium text-muted-foreground">{c}</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i} className="border-t border-border hover:bg-background">
                    {data.columns.map((c) => (
                      <td key={c} className="px-3 py-1.5 truncate max-w-xs">{formatCell(r[c])}</td>
                    ))}
                    <td className="px-3 py-1.5">
                      {idCol && (
                        <button onClick={async () => {
                          if (!confirm("Delete this row?")) return;
                          try { await del({ data: { workspaceId: ws.id, table, idColumn: idCol, idValue: r[idCol] } }); toast.success("Deleted"); load(); }
                          catch (e: any) { toast.error(e?.message ?? "Failed"); }
                        }} className="text-muted-foreground hover:text-error">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
            <span>{data.total} rows · page {page + 1}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="border border-border rounded px-2 py-1 hover:border-foreground disabled:opacity-30"><ChevronLeft className="h-3 w-3" /></button>
              <button onClick={() => setPage(page + 1)} disabled={(page + 1) * 50 >= data.total} className="border border-border rounded px-2 py-1 hover:border-foreground disabled:opacity-30"><ChevronRight className="h-3 w-3" /></button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function formatCell(v: any) {
  if (v === null || v === undefined) return <span className="text-muted-foreground">null</span>;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function SqlEditor({ ws, disabled }: { ws: any; disabled: boolean }) {
  const run = useServerFn(runSupabaseQuery);
  const [sql, setSql] = useState("select now();");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const isDangerous = /\b(drop|truncate|delete)\b/i.test(sql) && !/\bwhere\b/i.test(sql);

  const exec = async () => {
    if (isDangerous && !confirm("This query looks destructive (DROP / TRUNCATE / DELETE without WHERE). Continue?")) return;
    setBusy(true);
    try {
      const r = await run({ data: { workspaceId: ws.id, sql } });
      setResult(r);
    } finally { setBusy(false); }
  };

  if (disabled) return null;

  return (
    <Card title="SQL editor">
      <div className="border border-warning/30 bg-warning/5 rounded p-3 mb-3 flex gap-2 text-xs">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
        <span>This runs raw SQL against your Supabase database. Be careful — there's no undo.</span>
      </div>
      <textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={5}
        className="w-full bg-background border border-border rounded p-3 text-xs font-mono mb-3" />
      <button onClick={exec} disabled={busy} className="px-4 py-2 bg-brand text-primary-foreground rounded text-sm hover:opacity-90 disabled:opacity-50">
        {busy ? "Running…" : "Run Query"}
      </button>
      {result && (
        <div className="mt-4">
          {result.ok ? (
            <pre className="bg-background border border-border rounded p-3 text-[11px] font-mono overflow-auto max-h-80">{JSON.stringify(result.result, null, 2)}</pre>
          ) : (
            <div className="text-sm text-error">{result.error}</div>
          )}
        </div>
      )}
    </Card>
  );
}
