import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/UserAvatar";
import {
  respondAsSenderAi, respondAsCofounderAi, generatePrompt,
} from "@/lib/yofounder.functions";
import { runClaudeCode } from "@/lib/integrations.functions";
import { toast } from "sonner";
import {
  Github, Send, Sparkles, Copy, ExternalLink, ArrowLeft, X, Settings,
  Trash2, AlertTriangle, Plus, FileCode, Check, Loader2, Circle, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GithubTab } from "@/components/tabs/GithubTab";
import { VercelTab } from "@/components/tabs/VercelTab";
import { SupabaseTab } from "@/components/tabs/SupabaseTab";
import { DomainTab } from "@/components/tabs/DomainTab";

export const Route = createFileRoute("/workspaces/$id")({
  component: WorkspacePage,
  head: () => ({ meta: [{ title: "Workspace — YoFounder" }] }),
});

type Tab = "chat" | "code" | "github" | "vercel" | "supabase" | "domain";
const TAB_ORDER: Tab[] = ["chat", "code", "github", "vercel", "supabase", "domain"];

function WorkspacePage() {
  const { id: workspaceId } = useParams({ from: "/workspaces/$id" });
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("chat");
  const [ws, setWs] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [codeDot, setCodeDot] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const reloadWs = useCallback(async () => {
    const { data: w } = await supabase.from("workspaces").select("*").eq("id", workspaceId).single();
    if (!w) { navigate({ to: "/dashboard" }); return; }
    setWs(w);
  }, [workspaceId, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      await reloadWs();
      const { data: m } = await supabase
        .from("workspace_members")
        .select("user_id, role, profiles(id, display_name, avatar_color, ai_provider, last_seen_at)")
        .eq("workspace_id", workspaceId);
      setMembers(m ?? []);
    })();
  }, [workspaceId, user, navigate, reloadWs]);

  useEffect(() => {
    if (!user) return;
    const beat = () => supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
    beat();
    const id = setInterval(beat, 60_000);
    return () => clearInterval(id);
  }, [user]);

  if (!ws || !user) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground text-sm">Loading...</div>;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="px-4 md:px-6 h-14 flex items-center gap-4">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <Logo className="text-lg hidden sm:block" />
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <span className="font-semibold truncate">{ws.name}</span>
            {ws.github_repo && (
              <a href={`https://github.com/${ws.github_repo}`} target="_blank" rel="noreferrer"
                className="hidden md:flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground">
                <Github className="h-3 w-3" /> {ws.github_repo}
              </a>
            )}
          </div>
          <div className="flex -space-x-2">
            {members.map((m, i) => {
              const online = m.profiles?.last_seen_at && (Date.now() - new Date(m.profiles.last_seen_at).getTime() < 5*60*1000);
              return <Avatar key={i} name={m.profiles?.display_name ?? "?"} color={m.profiles?.avatar_color ?? "#666"} size="sm" online={online} />;
            })}
          </div>
          <Link to="/settings" className="text-muted-foreground hover:text-foreground" title="Settings">
            <Settings className="h-4 w-4" />
          </Link>
        </div>
        <nav className="px-4 md:px-6 flex gap-1 border-t border-border overflow-x-auto">
          {TAB_ORDER.map((t) => (
            <button key={t} onClick={() => { setTab(t); if (t === "code") setCodeDot(false); }}
              className={cn(
                "relative px-3 md:px-4 py-2.5 text-xs uppercase tracking-wide transition border-b-2",
                tab === t ? "text-foreground border-brand" : "text-muted-foreground border-transparent hover:text-foreground"
              )}>
              {t}
              {t === "code" && codeDot && <span className="absolute top-2 right-1 h-1.5 w-1.5 rounded-full bg-brand" />}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 flex flex-col min-h-0">
        {tab === "chat" && <ChatTab workspaceId={workspaceId} user={user} members={members} onPromptSaved={() => setCodeDot(true)} />}
        {tab === "code" && <CodeTab ws={ws} workspaceId={workspaceId} user={user} />}
        {tab === "github" && <GithubTab ws={ws} onWsUpdate={reloadWs} />}
        {tab === "vercel" && <VercelTab ws={ws} onWsUpdate={reloadWs} />}
        {tab === "supabase" && <SupabaseTab ws={ws} onWsUpdate={reloadWs} />}
        {tab === "domain" && <DomainTab ws={ws} onWsUpdate={reloadWs} />}
      </main>
    </div>
  );
}

/* ============ CHAT TAB ============ */
function ChatTab({ workspaceId, user, members, onPromptSaved }: any) {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState<{ name: string; provider: string; color: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [showGenModal, setShowGenModal] = useState(false);
  const [genResult, setGenResult] = useState<{ title: string; content: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const respondSender = useServerFn(respondAsSenderAi);
  const respondCofounder = useServerFn(respondAsCofounderAi);
  const genPrompt = useServerFn(generatePrompt);

  const membersById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const x of members) m[x.user_id] = x.profiles;
    return m;
  }, [members]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("messages")
        .select("*").eq("workspace_id", workspaceId).order("created_at").limit(200);
      setMessages(data ?? []);
    })();
    const channel = supabase.channel(`ws-${workspaceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `workspace_id=eq.${workspaceId}` },
        (payload) => setMessages((prev) => [...prev, payload.new]))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `workspace_id=eq.${workspaceId}` },
        (payload) => setMessages((prev) => prev.filter((m) => m.id !== (payload.old as any).id)))
      .on("broadcast", { event: "typing" }, (p) => {
        setTyping(p.payload as any);
        setTimeout(() => setTyping(null), 4000);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [workspaceId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const send = async () => {
    const content = text.trim();
    if (!content || content.length > 1000 || sending) return;
    setSending(true);
    setText("");
    setErrorBanner(null);
    const me = membersById[user.id];
    try {
      const { error } = await supabase.from("messages").insert({
        workspace_id: workspaceId, sender_user_id: user.id, sender_type: "human", content,
      });
      if (error) throw error;

      await supabase.channel(`ws-${workspaceId}`).send({
        type: "broadcast", event: "typing",
        payload: { name: me?.display_name, provider: me?.ai_provider, color: me?.avatar_color },
      });

      respondSender({ data: { workspaceId } })
        .then((r: any) => { if (r && r.ok === false) setErrorBanner("Something went wrong — try sending your message again"); })
        .catch(() => setErrorBanner("Something went wrong — try sending your message again"));
      respondCofounder({ data: { workspaceId } }).catch(() => {});
    } catch (e: any) {
      setErrorBanner("Something went wrong — try sending your message again");
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await genPrompt({ data: { workspaceId } });
      setGenResult(r);
      setShowGenModal(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setGenerating(false);
    }
  };

  const saveGenerated = async () => {
    if (!genResult) return;
    setSaving(true);
    const { error } = await supabase.from("prompts").insert({
      workspace_id: workspaceId, created_by: user.id,
      title: genResult.title, content: genResult.content, status: "ready",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved to Code tab");
    onPromptSaved?.();
    setShowGenModal(false);
    setGenResult(null);
  };

  const doDelete = async (id: string) => {
    setConfirmDelete(null);
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) toast.error(error.message);
    else setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <button onClick={generate} disabled={generating}
        className="absolute top-2 right-3 z-10 inline-flex items-center gap-1.5 border border-border bg-surface text-foreground/80 hover:text-foreground text-[11px] px-2.5 py-1.5 rounded hover:border-foreground disabled:opacity-50">
        <Sparkles className="h-3 w-3" /> {generating ? "Generating..." : "Generate Claude Code Prompt"}
      </button>
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-6 py-6 space-y-4">
        {errorBanner && (
          <div className="bg-error/10 border border-error/40 text-error text-sm rounded p-3 flex items-center justify-between">
            <span>{errorBanner}</span>
            <button onClick={() => setErrorBanner(null)} className="text-error/70 hover:text-error"><X className="h-4 w-4" /></button>
          </div>
        )}
        {messages.map((m) => {
          const sender = membersById[m.sender_user_id];
          const color = sender?.avatar_color ?? "#666";
          const name = sender?.display_name ?? "?";
          const isAi = m.sender_type === "ai";
          const isMine = !isAi && m.sender_user_id === user.id;
          const borderColor = m.ai_provider === "claude" ? "#6366f1" : m.ai_provider === "gpt" ? "#10b981" : m.ai_provider === "gemini" ? "#4285F4" : "transparent";
          const providerName = m.ai_provider === "claude" ? "Claude" : m.ai_provider === "gpt" ? "ChatGPT" : m.ai_provider === "gemini" ? "Gemini" : "AI";
          const label = isAi ? `${name}'s ${providerName}` : name;
          return (
            <div key={m.id} className="flex gap-3 group">
              <Avatar name={name} color={color} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium">{label}</span>
                  <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition">
                    {new Date(m.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <div
                  className={cn(
                    "mt-1 text-sm whitespace-pre-wrap leading-relaxed",
                    isAi ? "font-mono pl-3 border-l-2" : "",
                    m.is_error ? "text-error" : ""
                  )}
                  style={isAi ? { borderColor } : undefined}
                >
                  {m.content}
                </div>
              </div>
              {isMine && (
                <button
                  onClick={() => setConfirmDelete(m.id)}
                  title="Delete message"
                  className="opacity-0 group-hover:opacity-100 transition self-start text-muted-foreground hover:text-error p-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {typing && (
          <div className="flex gap-3 items-center text-xs text-muted-foreground">
            <Avatar name={typing.name} color={typing.color} size="sm" />
            <span>{typing.name}'s {typing.provider === "claude" ? "Claude" : typing.provider === "gemini" ? "Gemini" : "ChatGPT"} is thinking</span>
            <span className="flex gap-1">
              <span className="typing-dot h-1.5 w-1.5 rounded-full" style={{ background: typing.color }} />
              <span className="typing-dot h-1.5 w-1.5 rounded-full" style={{ background: typing.color }} />
              <span className="typing-dot h-1.5 w-1.5 rounded-full" style={{ background: typing.color }} />
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-border bg-surface">
        <div className="px-4 md:px-6 py-3 flex gap-2 items-end">
          <textarea
            value={text} onChange={(e) => setText(e.target.value.slice(0, 1000))}
            onKeyDown={onKey} placeholder="What should we build?"
            rows={2}
            className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-brand"
          />
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] text-muted-foreground">{text.length}/1000</span>
            <button onClick={send} disabled={!text.trim() || sending}
              className="bg-brand text-primary-foreground p-2.5 rounded hover:opacity-90 disabled:opacity-50">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {showGenModal && genResult && (
        <Modal onClose={() => setShowGenModal(false)} title="Generated Claude Code Prompt">
          <input
            value={genResult.title}
            onChange={(e) => setGenResult({ ...genResult, title: e.target.value })}
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm font-semibold mb-3"
          />
          <textarea
            value={genResult.content}
            onChange={(e) => setGenResult({ ...genResult, content: e.target.value })}
            rows={16}
            className="w-full bg-background border border-border rounded px-3 py-2 text-xs font-mono mb-4"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowGenModal(false)} className="px-4 py-2 border border-border rounded text-sm hover:border-foreground">Cancel</button>
            <button onClick={saveGenerated} disabled={saving} className="px-4 py-2 bg-brand text-primary-foreground rounded text-sm hover:opacity-90 disabled:opacity-50">
              {saving ? "Saving..." : "Save to Code Tab"}
            </button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Delete this message?" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-muted-foreground mb-4">This action cannot be undone.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 border border-border rounded text-sm hover:border-foreground">Cancel</button>
            <button onClick={() => doDelete(confirmDelete)} className="px-4 py-2 bg-error text-primary-foreground rounded text-sm hover:opacity-90">Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============ CODE TAB ============ */
type Job = {
  id: string;
  status: string;
  branch_name: string | null;
  last_message: string | null;
  error: string | null;
  pr_url: string | null;
  pr_number: number | null;
  proposal_id: string | null;
};

const STEPS: { key: string; label: string; matches: string[] }[] = [
  { key: "read",   label: "Reading your code",          matches: ["reading", "cloning"] },
  { key: "code",   label: "Making your changes",        matches: ["coding"] },
  { key: "commit", label: "Saving the changes",         matches: ["committing"] },
  { key: "pr",     label: "Sending changes for review", matches: ["pr_opened"] },
];

function stepState(jobStatus: string, idx: number): "done" | "active" | "idle" | "error" {
  const order = ["queued", "reading", "coding", "committing", "pr_opened"];
  // back-compat: treat legacy "cloning" as "reading"
  const status = jobStatus === "cloning" ? "reading" : jobStatus;
  if (status === "failed") {
    return idx === 0 ? "error" : "idle";
  }
  const cur = order.indexOf(status);
  if (cur < 0) return "idle";
  if (status === "pr_opened") return "done";
  if (cur > idx + 1) return "done";
  if (cur === idx + 1) return "active";
  return "idle";
}

function CodeTab({ ws, workspaceId, user }: any) {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [running, setRunning] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [jobs, setJobs] = useState<Record<string, Job>>({}); // by proposal_id
  const [activeWsJob, setActiveWsJob] = useState<Job | null>(null);
  const runFn = useServerFn(runClaudeCode);

  const hasRepo = !!ws.github_repo;

  // Load prompts + realtime
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("prompts")
        .select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
      setPrompts(data ?? []);
      if ((data ?? []).length && !selected) setSelected(data![0]);
    })();
    const ch = supabase.channel(`prompts-${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "prompts", filter: `workspace_id=eq.${workspaceId}` },
        async () => {
          const { data } = await supabase.from("prompts").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
          setPrompts(data ?? []);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // Load jobs + realtime
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("claude_code_jobs")
        .select("*").eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }).limit(50);
      const map: Record<string, Job> = {};
      for (const j of (data ?? []) as Job[]) {
        if (j.proposal_id && !map[j.proposal_id]) map[j.proposal_id] = j;
      }
      setJobs(map);
      const act = (data ?? []).find((j: any) =>
        ["queued", "reading", "cloning", "coding", "committing"].includes(j.status)
      );
      setActiveWsJob((act as Job) ?? null);
    })();
    const ch = supabase.channel(`jobs-${workspaceId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "claude_code_jobs", filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Job;
          if (!row) return;
          setJobs((prev) => {
            const next = { ...prev };
            if (row.proposal_id) {
              const existing = next[row.proposal_id];
              if (!existing || new Date((payload.new as any)?.updated_at ?? 0) >= new Date((existing as any).updated_at ?? 0)) {
                next[row.proposal_id] = row;
              }
            }
            return next;
          });
          if (["queued", "reading", "cloning", "coding", "committing"].includes(row.status)) {
            setActiveWsJob(row);
          } else {
            setActiveWsJob((cur) => (cur && cur.id === row.id ? null : cur));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId]);

  useEffect(() => {
    if (selected) { setTitle(selected.title); setContent(selected.content); }
    else { setTitle(""); setContent(""); }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const job = selected ? jobs[selected.id] : null;
  const isJobRunning = !!job && ["queued", "reading", "cloning", "coding", "committing"].includes(job.status);
  const blockedByOther = !!activeWsJob && (!job || activeWsJob.id !== job.id);

  const newBlank = async () => {
    const { data, error } = await supabase.from("prompts").insert({
      workspace_id: workspaceId, created_by: user.id,
      title: "New prompt", content: "", status: "draft",
    }).select().single();
    if (error) return toast.error(error.message);
    setSelected(data);
  };

  const saveEdits = async () => {
    if (!selected) return;
    await supabase.from("prompts").update({ title, content }).eq("id", selected.id);
  };

  const runJob = async () => {
    if (!selected || !hasRepo) return;
    setConfirmRun(false);
    setRunning(true);
    try {
      await supabase.from("prompts").update({ title, content }).eq("id", selected.id);
      await runFn({ data: { workspaceId, promptId: selected.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start");
    } finally {
      setRunning(false);
    }
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deletePrompt = async () => {
    if (!selected) return;
    setConfirmDel(false);
    const { error } = await supabase.from("prompts").delete().eq("id", selected.id);
    if (error) return toast.error(error.message);
    setSelected(null);
  };

  const statusStyle = (s: string) => {
    const j = (s || "").toLowerCase();
    if (j === "pushed" || j === "pr_opened") return "bg-violet-500/15 text-violet-400";
    if (["reading", "cloning", "coding", "committing", "queued"].includes(j)) return "bg-blue-500/15 text-blue-400 animate-pulse";
    if (j === "failed") return "bg-error/15 text-error";
    if (j === "ready") return "bg-amber-500/15 text-amber-500";
    return "bg-muted text-muted-foreground";
  };

  // Combine prompt status with live job status for display
  const displayStatus = (p: any) => {
    const j = jobs[p.id];
    if (j && ["queued", "reading", "cloning", "coding", "committing", "failed"].includes(j.status)) return j.status;
    if (j && j.status === "pr_opened") return "pr_opened";
    return p.status;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top bar */}
      <div className="border-b border-border px-4 md:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        {hasRepo ? (
          <div className="flex items-center gap-2 text-sm">
            <Github className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Pushing to:</span>
            <a href={`https://github.com/${ws.github_repo}`} target="_blank" rel="noreferrer"
              className="font-mono text-foreground hover:underline">{ws.github_repo}</a>
          </div>
        ) : (
          <Link to="/settings" className="flex items-center gap-2 text-sm text-amber-500 hover:underline">
            <AlertTriangle className="h-4 w-4" />
            <span>Connect a GitHub repo in settings to use this feature</span>
          </Link>
        )}
        <button onClick={newBlank}
          className="inline-flex items-center gap-1.5 bg-brand text-primary-foreground px-3 py-1.5 rounded text-sm hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> New Prompt
        </button>
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* List */}
        <aside className="md:w-80 md:border-r border-b md:border-b-0 border-border overflow-y-auto scrollbar-thin max-h-60 md:max-h-none">
          {prompts.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              <FileCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No prompts yet. Generate one from chat, or create a new prompt.
            </div>
          ) : (
            <ul>
              {prompts.map((p) => {
                const s = displayStatus(p);
                return (
                  <li key={p.id}>
                    <button onClick={() => setSelected(p)}
                      className={cn("w-full text-left p-3 border-b border-border hover:bg-surface", selected?.id === p.id && "bg-surface")}>
                      <div className="text-sm font-medium truncate">{p.title}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={cn("text-[10px] uppercase px-1.5 py-0.5 rounded", statusStyle(s))}>
                          {s}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="mt-1.5 text-[11px] text-muted-foreground line-clamp-2">
                        {(p.content || "").slice(0, 80)}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Detail */}
        <section className="flex-1 overflow-y-auto scrollbar-thin p-6">
          {!selected ? (
            <div className="text-muted-foreground text-sm">Select or create a prompt.</div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-2">
                <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveEdits}
                  className="flex-1 bg-transparent text-lg font-semibold border-b border-transparent hover:border-border focus:border-brand focus:outline-none pb-2" />
                <span className={cn("text-[10px] uppercase px-1.5 py-0.5 rounded shrink-0", statusStyle(displayStatus(selected)))}>
                  {displayStatus(selected)}
                </span>
              </div>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} onBlur={saveEdits}
                rows={16}
                style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
                className="w-full bg-background border border-border rounded p-3 text-xs focus:outline-none focus:border-brand" />
              <div className="mt-1 text-[10px] text-muted-foreground text-right">{content.length} chars</div>

              <div className="mt-4 flex gap-2 flex-wrap items-center">
                <button onClick={() => setConfirmRun(true)}
                  disabled={running || !hasRepo || isJobRunning || blockedByOther}
                  className="bg-amber-500 text-background px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4" /> {isJobRunning ? "Working on it..." : running ? "Starting..." : "Make this change"}
                </button>
                <button onClick={copyPrompt}
                  className="px-4 py-2 border border-border rounded text-sm hover:border-foreground inline-flex items-center gap-1.5">
                  <Copy className="h-4 w-4" /> {copied ? "Copied!" : "Copy instructions"}
                </button>
                <button onClick={() => setConfirmDel(true)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-error inline-flex items-center gap-1.5">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
                {blockedByOther && (
                  <span className="text-xs text-amber-500">Another change is in progress — hang tight.</span>
                )}
              </div>

              {job && <JobPanel job={job} repo={ws.github_repo} />}
            </>
          )}
        </section>
      </div>

      {confirmRun && (
        <Modal title="Run with Claude Code?" onClose={() => setConfirmRun(false)}>
          <p className="text-sm text-muted-foreground mb-4">
            Claude Code will clone your repo, implement this change, and open a PR on GitHub. Continue?
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmRun(false)} className="px-4 py-2 border border-border rounded text-sm hover:border-foreground">Cancel</button>
            <button onClick={runJob} className="px-4 py-2 bg-amber-500 text-background rounded text-sm font-medium hover:opacity-90">Run</button>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Modal title="Delete this prompt?" onClose={() => setConfirmDel(false)}>
          <p className="text-sm text-muted-foreground mb-4">This action cannot be undone.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmDel(false)} className="px-4 py-2 border border-border rounded text-sm hover:border-foreground">Cancel</button>
            <button onClick={deletePrompt} className="px-4 py-2 bg-error text-primary-foreground rounded text-sm hover:opacity-90">Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function JobPanel({ job, repo }: { job: Job; repo: string | null }) {
  const failed = job.status === "failed";
  const done = job.status === "pr_opened";
  return (
    <div className={cn(
      "mt-6 border rounded p-4",
      failed ? "border-error/40 bg-error/5" :
      done ? "border-success/40 bg-success/5" :
      "border-border bg-surface"
    )}>
      <div className="flex items-center gap-2 mb-3">
        {done ? <Check className="h-4 w-4 text-success" /> :
          failed ? <AlertCircle className="h-4 w-4 text-error" /> :
          <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />}
        <span className="text-sm font-medium">
          {done ? "PR opened" : failed ? "Job failed" : "Claude Code is working..."}
        </span>
        {job.branch_name && (
          <span className="text-[10px] font-mono text-muted-foreground ml-auto">{job.branch_name}</span>
        )}
      </div>

      <ul className="space-y-1.5 mb-3">
        {STEPS.map((s, i) => {
          const state = failed ? (i === 0 ? "error" : "idle") : stepState(job.status, i);
          const Icon = state === "done" ? Check
            : state === "active" ? Loader2
            : state === "error" ? AlertCircle
            : Circle;
          const color = state === "done" ? "text-success"
            : state === "active" ? "text-blue-400"
            : state === "error" ? "text-error"
            : "text-muted-foreground/50";
          return (
            <li key={s.key} className="flex items-center gap-2 text-xs">
              <Icon className={cn("h-3.5 w-3.5 shrink-0", color, state === "active" && "animate-spin")} />
              <span className={cn(color)}>{s.label}</span>
            </li>
          );
        })}
      </ul>

      {job.last_message && !failed && (
        <div className="text-xs text-muted-foreground border-t border-border pt-2">
          <span className="text-muted-foreground/70">Last action:</span> <span className="font-mono">{job.last_message}</span>
        </div>
      )}

      {failed && (
        <div className="text-xs text-error border-t border-error/20 pt-2 mt-2 whitespace-pre-wrap font-mono">
          {job.error || "Unknown error"}
        </div>
      )}

      {done && job.pr_url && (
        <div className="border-t border-success/20 pt-3 mt-2 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-success flex-1">PR #{job.pr_number} opened on {repo}</span>
          <a href={job.pr_url} target="_blank" rel="noreferrer"
            className="text-xs inline-flex items-center gap-1 bg-brand text-primary-foreground rounded px-3 py-1.5 hover:opacity-90">
            View PR on GitHub <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
