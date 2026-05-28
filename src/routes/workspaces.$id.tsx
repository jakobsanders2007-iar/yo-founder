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
import {
  runClaudeCode, getGithubPRDetail, getRepoTree, getRepoFile,
  approveAndPushPR, closeGithubPR, fetchVercelPreview,
} from "@/lib/integrations.functions";
import { toast } from "sonner";
import {
  Github, Send, Sparkles, Copy, ExternalLink, ArrowLeft, X, Settings,
  Trash2, AlertTriangle, Plus, FileCode, Check, Loader2, Circle, AlertCircle,
  Play, RefreshCw, Maximize2, Link2, ChevronRight, ChevronDown, Folder, File as FileIcon,
  Terminal, GitPullRequest, Eye, FileDiff, Files as FilesIcon, Wrench, Zap,
} from "lucide-react";
import confetti from "canvas-confetti";
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
  updated_at?: string | null;
  created_at?: string | null;
};

type SubTab = "preview" | "diff" | "files" | "logs";

type BuildStatus =
  | "waiting" | "thinking" | "building" | "saving"
  | "reviewing" | "approved" | "live" | "error";

function deriveBuildStatus(prompt: any, job: Job | null | undefined): BuildStatus {
  if (!prompt && !job) return "waiting";
  if (job) {
    if (["queued", "reading", "cloning"].includes(job.status)) return "thinking";
    if (job.status === "coding") return "building";
    if (job.status === "committing") return "saving";
    if (job.status === "failed") return "error";
  }
  if (prompt?.status === "deployed") return "live";
  if (prompt?.status === "pr_opened" || job?.status === "pr_opened") return "reviewing";
  return "waiting";
}

const STATUS_META: Record<BuildStatus, { dot: string; label: string; ring: string; pulse: boolean }> = {
  waiting:   { dot: "bg-muted-foreground/40", label: "Ready when you are",    ring: "border-border",         pulse: false },
  thinking:  { dot: "bg-amber-400",           label: "Reading your code...",  ring: "border-amber-500/40",   pulse: true  },
  building:  { dot: "bg-blue-400",            label: "Making your changes...", ring: "border-blue-500/40",    pulse: true  },
  saving:    { dot: "bg-violet-400",          label: "Saving the changes...", ring: "border-violet-500/40",  pulse: true  },
  reviewing: { dot: "bg-amber-500",           label: "Waiting for your approval", ring: "border-amber-500/60", pulse: true },
  approved:  { dot: "bg-emerald-400",         label: "Pushing to GitHub...",  ring: "border-emerald-500/40", pulse: true  },
  live:      { dot: "bg-emerald-500",         label: "Changes are live!",     ring: "border-emerald-500/60", pulse: false },
  error:     { dot: "bg-red-500",             label: "Something went wrong",  ring: "border-red-500/40",     pulse: false },
};

const STEPS = [
  { key: "read",   label: "Reading your code" },
  { key: "code",   label: "Making your changes" },
  { key: "commit", label: "Saving the changes" },
  { key: "pr",     label: "Sending changes for review" },
];

function stepState(jobStatus: string, idx: number): "done" | "active" | "idle" | "error" {
  const order = ["queued", "reading", "coding", "committing", "pr_opened"];
  const status = jobStatus === "cloning" ? "reading" : jobStatus;
  if (status === "failed") return idx === 0 ? "error" : "idle";
  const cur = order.indexOf(status);
  if (cur < 0) return "idle";
  if (status === "pr_opened") return "done";
  if (cur > idx + 1) return "done";
  if (cur === idx + 1) return "active";
  return "idle";
}

function BuildStatusBadge({ status }: { status: BuildStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={cn(
      "inline-flex items-center gap-2 px-2.5 py-1 rounded-full border bg-[#0f0f0f] text-xs transition-all duration-200",
      m.ring
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot, m.pulse && "animate-pulse")} />
      <span className="text-foreground/90">{m.label}</span>
    </span>
  );
}

function CodeTab({ ws, workspaceId, user }: any) {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [activeWsJob, setActiveWsJob] = useState<Job | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("preview");
  const [promptText, setPromptText] = useState("");
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const [confirmReject, setConfirmReject] = useState(false);
  const [running, setRunning] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const runFn = useServerFn(runClaudeCode);
  const approveFn = useServerFn(approveAndPushPR);
  const closeFn = useServerFn(closeGithubPR);
  const refreshPreviewFn = useServerFn(fetchVercelPreview);
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
          setSelected((cur: any) => cur ? (data ?? []).find((p: any) => p.id === cur.id) ?? cur : (data?.[0] ?? null));
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

  const job = selected ? jobs[selected.id] : null;
  const buildStatus = deriveBuildStatus(selected, job);
  const isJobRunning = !!job && ["queued", "reading", "cloning", "coding", "committing"].includes(job.status);
  const blockedByOther = !!activeWsJob && (!job || activeWsJob.id !== job.id);
  const canApprove = selected?.status === "pr_opened" && selected?.github_issue_number;

  const focusPrompt = useCallback(() => {
    setTimeout(() => promptRef.current?.focus(), 0);
  }, []);

  const startNewPrompt = async (initialText = "") => {
    const { data, error } = await supabase.from("prompts").insert({
      workspace_id: workspaceId, created_by: user.id,
      title: initialText.slice(0, 60) || "New change",
      content: initialText, status: "draft",
    }).select().single();
    if (error) return toast.error(error.message);
    setSelected(data);
    setPromptText(initialText);
    focusPrompt();
  };

  const runPrompt = async () => {
    if (!hasRepo) return toast.error("Connect your code first — head to the GitHub tab.");
    if (!promptText.trim()) return;
    if (isJobRunning || blockedByOther) return;
    setRunning(true);
    try {
      let target = selected;
      if (!target || target.status !== "draft") {
        const { data, error } = await supabase.from("prompts").insert({
          workspace_id: workspaceId, created_by: user.id,
          title: promptText.slice(0, 60), content: promptText, status: "draft",
        }).select().single();
        if (error) throw error;
        target = data;
        setSelected(data);
      } else {
        await supabase.from("prompts").update({
          title: promptText.slice(0, 60) || target.title,
          content: promptText,
        }).eq("id", target.id);
      }
      await runFn({ data: { workspaceId, promptId: target.id } });
      setSubTab("logs");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't start the change");
    } finally {
      setRunning(false);
    }
  };

  const onApprove = async () => {
    if (!selected?.github_issue_number) return;
    try {
      await approveFn({ data: { workspaceId, promptId: selected.id, prNumber: selected.github_issue_number } });
      confetti({ particleCount: 120, spread: 75, origin: { y: 0.4 }, colors: ["#f59e0b", "#fbbf24", "#22c55e", "#ffffff"] });
      toast.success("Approved — your update is going live!");
      setSubTab("preview");
      // Try fetching a fresh preview a few times as Vercel builds
      setTimeout(() => refreshPreviewFn({ data: { workspaceId, promptId: selected.id } }).catch(() => {}), 8000);
      setTimeout(() => refreshPreviewFn({ data: { workspaceId, promptId: selected.id } }).catch(() => {}), 25000);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't approve — try again");
    }
  };

  const onReject = async () => {
    if (!selected?.github_issue_number) return;
    setConfirmReject(false);
    try {
      await closeFn({ data: { workspaceId, promptId: selected.id, prNumber: selected.github_issue_number } });
      toast.success("Change request closed.");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't close the change");
    }
  };

  const requestChanges = () => {
    setPromptText(`Make these changes to the current version: `);
    focusPrompt();
  };

  // Empty state — no prompts ever
  if (prompts.length === 0 && !running) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-[#080808]">
        <CodeTopBar ws={ws} status="waiting" canApprove={false} onApprove={() => {}} />
        <CodeEmptyState
          hasRepo={hasRepo}
          value={promptText}
          onChange={setPromptText}
          onSubmit={() => {
            if (promptText.trim()) startNewPrompt(promptText.trim());
          }}
          inputRef={promptRef}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#080808]">
      <CodeTopBar
        ws={ws}
        status={buildStatus}
        canApprove={!!canApprove}
        onApprove={onApprove}
      />

      <SubTabBar value={subTab} onChange={setSubTab} />

      <div className="flex-1 min-h-0 overflow-hidden">
        {subTab === "preview" && (
          <PreviewPane
            url={selected?.vercel_preview_url ?? null}
            vercelConfigured={!!ws.vercel_token && !!ws.vercel_project_id}
            onAskAi={() => focusPrompt()}
          />
        )}
        {subTab === "diff" && (
          <DiffPane prompt={selected} workspaceId={workspaceId} />
        )}
        {subTab === "files" && (
          <FilesPane
            workspaceId={workspaceId}
            hasRepo={hasRepo}
            onAddContext={(p) => {
              setContextFiles((cur) => cur.includes(p) ? cur : [...cur, p]);
              toast.success(`Added ${p.split("/").pop()} to prompt context`);
            }}
          />
        )}
        {subTab === "logs" && (
          <LogsPane
            job={job}
            onFixError={(msg) => {
              setPromptText(`Fix this error: ${msg}`);
              focusPrompt();
            }}
          />
        )}
      </div>

      {/* Change summary card */}
      {selected && (selected.status === "pr_opened" || selected.status === "deployed") && selected.summary && (
        <ChangeSummaryCard prompt={selected} />
      )}

      {/* Approval card */}
      {canApprove && (
        <ApprovalCard
          onApprove={onApprove}
          onRequestChanges={requestChanges}
          onReject={() => setConfirmReject(true)}
        />
      )}

      {/* Prompt dock */}
      <PromptDock
        value={promptText}
        onChange={setPromptText}
        onSubmit={runPrompt}
        disabled={!hasRepo}
        running={isJobRunning || running}
        blockedByOther={blockedByOther}
        contextFiles={contextFiles}
        onRemoveContext={(p: string) => setContextFiles((cur) => cur.filter((x) => x !== p))}
        inputRef={promptRef}
      />

      {confirmReject && (
        <Modal title="Close this change request?" onClose={() => setConfirmReject(false)}>
          <p className="text-sm text-muted-foreground mb-4">
            This will close the change request and discard the proposed changes. You can always start a new one. Sure?
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmReject(false)} className="px-4 py-2 border border-border rounded text-sm hover:border-foreground">Keep it open</button>
            <button onClick={onReject} className="px-4 py-2 bg-error text-primary-foreground rounded text-sm hover:opacity-90">Yes, close it</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- Top bar ---------- */
function CodeTopBar({ ws, status, canApprove, onApprove }: any) {
  return (
    <div className="border-b border-[#1e1e1e] px-4 md:px-6 py-3 flex items-center justify-between gap-3 flex-wrap bg-[#0a0a0a]">
      <div className="flex items-center gap-3 min-w-0 flex-wrap">
        {ws.github_repo ? (
          <a href={`https://github.com/${ws.github_repo}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-mono text-foreground/90 hover:text-foreground truncate">
            <Github className="h-4 w-4 text-muted-foreground" /> {ws.github_repo}
          </a>
        ) : (
          <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-amber-500 hover:underline">
            <AlertTriangle className="h-4 w-4" /> Connect your code in settings
          </Link>
        )}
        {ws.github_repo && (
          <span className="text-xs font-mono text-muted-foreground border border-[#1e1e1e] rounded px-1.5 py-0.5">
            {ws.github_branch || "main"}
          </span>
        )}
        <BuildStatusBadge status={status} />
      </div>
      <button
        onClick={onApprove}
        disabled={!canApprove}
        className="inline-flex items-center gap-1.5 bg-amber-500 text-background px-3 py-1.5 rounded text-sm font-medium hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition"
      >
        <GitPullRequest className="h-3.5 w-3.5" /> Push to GitHub
      </button>
    </div>
  );
}

/* ---------- Sub-tab bar ---------- */
function SubTabBar({ value, onChange }: { value: SubTab; onChange: (v: SubTab) => void }) {
  const items: { key: SubTab; label: string; icon: any }[] = [
    { key: "preview", label: "Preview", icon: Eye },
    { key: "diff", label: "Diff", icon: FileDiff },
    { key: "files", label: "Files", icon: FilesIcon },
    { key: "logs", label: "Logs", icon: Terminal },
  ];
  return (
    <div className="border-b border-[#1e1e1e] bg-[#0a0a0a] overflow-x-auto scrollbar-thin">
      <div className="flex gap-1 px-2">
        {items.map((it) => {
          const Icon = it.icon;
          const active = value === it.key;
          return (
            <button key={it.key} onClick={() => onChange(it.key)}
              className={cn(
                "relative inline-flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
              )}>
              <Icon className="h-3.5 w-3.5" /> {it.label}
              {active && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-amber-500 rounded-t" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Preview pane ---------- */
function PreviewPane({ url, vercelConfigured, onAskAi }: { url: string | null; vercelConfigured: boolean; onAskAi: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setShowFallback(false);
    if (!url) return;
    const t = setTimeout(() => { if (!loaded) setShowFallback(true); }, 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (!url) {
    return (
      <div className="relative h-full w-full flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }} />
        <div className="relative text-center max-w-md px-6">
          <Logo className="text-3xl mb-6 inline-block" />
          <h2 className="text-xl font-semibold text-foreground">Your app will appear here</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {vercelConfigured
              ? "Write a prompt below, approve the changes, and your live preview appears automatically."
              : "Connect Vercel in the Vercel tab to see your live preview here."}
          </p>
          <button onClick={onAskAi}
            className="mt-6 inline-flex items-center gap-1.5 bg-amber-500 text-background px-4 py-2 rounded text-sm font-medium hover:opacity-90">
            <Sparkles className="h-4 w-4" /> Ask AI to build something
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#080808]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e1e1e] bg-[#0a0a0a]">
        <div className="flex-1 min-w-0 text-xs font-mono text-muted-foreground truncate">{url}</div>
        <button onClick={() => { iframeRef.current?.contentWindow?.location.reload(); setLoaded(false); setShowFallback(false); setTimeout(() => { if (!loaded) setShowFallback(true); }, 6000); }}
          className="p-1.5 rounded hover:bg-[#1e1e1e] text-muted-foreground hover:text-foreground" title="Refresh">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="p-1.5 rounded hover:bg-[#1e1e1e] text-muted-foreground hover:text-foreground" title="Copy link">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Link2 className="h-3.5 w-3.5" />}
        </button>
        <a href={url} target="_blank" rel="noreferrer"
          className="p-1.5 rounded hover:bg-[#1e1e1e] text-muted-foreground hover:text-foreground" title="Open in new tab">
          <Maximize2 className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="flex-1 relative bg-white">
        {!loaded && (
          <div className="absolute inset-0 bg-[#0a0a0a] animate-pulse" />
        )}
        {showFallback && !loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a] text-center px-6">
            <div>
              <Wrench className="h-6 w-6 mx-auto text-amber-500 mb-3" />
              <p className="text-sm text-foreground">Preview loading... this takes ~30 seconds after a change is approved 🔧</p>
              <a href={url} target="_blank" rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-amber-500 hover:underline">
                Open preview in new tab <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}
        <iframe ref={iframeRef} src={url} onLoad={() => setLoaded(true)}
          className="w-full h-full border-0" title="Live preview" />
      </div>
    </div>
  );
}

/* ---------- Diff pane ---------- */
function DiffPane({ prompt, workspaceId }: { prompt: any; workspaceId: string }) {
  const [files, setFiles] = useState<any[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fn = useServerFn(getGithubPRDetail);
  const prNumber = prompt?.github_issue_number;

  useEffect(() => {
    setFiles(null); setActive(null); setErr(null);
    if (!prNumber) return;
    (async () => {
      try {
        const res = await fn({ data: { workspaceId, prNumber } });
        setFiles(res.files);
        setActive(res.files?.[0]?.filename ?? null);
      } catch (e: any) {
        setErr(e?.message ?? "Couldn't load the diff");
      }
    })();
  }, [prNumber, workspaceId, fn]);

  if (!prNumber) {
    return <PaneEmpty icon={<FileDiff className="h-8 w-8" />} text="No changes yet — run a prompt to see what your AI engineer changes 🔍" />;
  }
  if (err) return <PaneEmpty icon={<AlertCircle className="h-8 w-8 text-red-400" />} text={err} />;
  if (!files) return <PaneSkeleton />;

  const activeFile = files.find((f) => f.filename === active);
  return (
    <div className="h-full flex flex-col md:flex-row">
      <aside className="md:w-[30%] md:border-r border-b md:border-b-0 border-[#1e1e1e] overflow-y-auto scrollbar-thin bg-[#0a0a0a] max-h-48 md:max-h-none">
        <div className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground border-b border-[#1e1e1e]">Changed files</div>
        {files.map((f) => (
          <button key={f.filename} onClick={() => setActive(f.filename)}
            className={cn(
              "w-full text-left px-3 py-2 border-b border-[#141414] hover:bg-[#111] flex items-center gap-2",
              active === f.filename && "bg-[#111] border-l-2 border-l-amber-500"
            )}>
            <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate text-xs font-mono">{f.filename}</span>
            <span className="text-[10px] text-emerald-400 shrink-0">+{f.additions}</span>
            <span className="text-[10px] text-red-400 shrink-0">-{f.deletions}</span>
          </button>
        ))}
      </aside>
      <section className="flex-1 overflow-auto scrollbar-thin bg-[#080808]">
        {activeFile ? (
          <>
            <div className="sticky top-0 px-3 py-2 border-b border-[#1e1e1e] bg-[#0a0a0a] text-xs font-mono text-foreground/90">{activeFile.filename}</div>
            <pre className="text-xs leading-relaxed" style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
              {(activeFile.patch || "").split("\n").map((line: string, i: number) => {
                const isAdd = line.startsWith("+") && !line.startsWith("+++");
                const isDel = line.startsWith("-") && !line.startsWith("---");
                const isHunk = line.startsWith("@@");
                return (
                  <div key={i} className={cn(
                    "px-3 py-0.5 flex gap-3",
                    isAdd && "bg-emerald-500/10 text-emerald-300",
                    isDel && "bg-red-500/10 text-red-300",
                    isHunk && "bg-[#111] text-amber-400/80",
                  )}>
                    <span className="select-none text-muted-foreground/40 w-8 text-right shrink-0">{i + 1}</span>
                    <span className="whitespace-pre-wrap break-all">{line || " "}</span>
                  </div>
                );
              })}
            </pre>
          </>
        ) : (
          <PaneEmpty icon={<FileDiff className="h-8 w-8" />} text="Select a file to view its changes" />
        )}
      </section>
    </div>
  );
}

/* ---------- Files pane ---------- */
type TreeNode = { path: string; type: "blob" | "tree" };
function FilesPane({ workspaceId, hasRepo, onAddContext }: { workspaceId: string; hasRepo: boolean; onAddContext: (p: string) => void }) {
  const [nodes, setNodes] = useState<TreeNode[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<{ path: string; content: string; lines: number } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "": true });
  const treeFn = useServerFn(getRepoTree);
  const fileFn = useServerFn(getRepoFile);

  useEffect(() => {
    if (!hasRepo) return;
    (async () => {
      try {
        const res = await treeFn({ data: { workspaceId } });
        setNodes(res.nodes);
      } catch (e: any) {
        setErr(e?.message ?? "Couldn't load files");
      }
    })();
  }, [workspaceId, hasRepo, treeFn]);

  useEffect(() => {
    if (!active) return;
    setFileLoading(true);
    setFileContent(null);
    fileFn({ data: { workspaceId, path: active } })
      .then((r: any) => setFileContent(r))
      .catch((e: any) => toast.error(e?.message ?? "Couldn't open file"))
      .finally(() => setFileLoading(false));
  }, [active, workspaceId, fileFn]);

  if (!hasRepo) return <PaneEmpty icon={<FilesIcon className="h-8 w-8" />} text="Connect your code in settings to browse files." />;
  if (err) return <PaneEmpty icon={<AlertCircle className="h-8 w-8 text-red-400" />} text={err} />;
  if (!nodes) return <PaneSkeleton />;

  // Group into folder map
  const byParent: Record<string, TreeNode[]> = {};
  for (const n of nodes) {
    const parent = n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : "";
    if (!byParent[parent]) byParent[parent] = [];
    byParent[parent].push(n);
  }
  for (const k in byParent) {
    byParent[k].sort((a, b) => {
      if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
  }

  const renderLevel = (parent: string, depth: number): React.ReactNode => {
    const items = byParent[parent] ?? [];
    return items.map((n) => {
      if (n.type === "tree") {
        const open = expanded[n.path];
        return (
          <div key={n.path}>
            <button onClick={() => setExpanded((e) => ({ ...e, [n.path]: !e[n.path] }))}
              className="w-full text-left px-2 py-1 hover:bg-[#111] flex items-center gap-1 text-xs"
              style={{ paddingLeft: depth * 12 + 8 }}>
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Folder className="h-3.5 w-3.5 text-amber-500/80" />
              <span className="truncate">{n.path.split("/").pop()}</span>
            </button>
            {open && renderLevel(n.path, depth + 1)}
          </div>
        );
      }
      const fname = n.path.split("/").pop()!;
      return (
        <div key={n.path} className={cn("group flex items-center hover:bg-[#111]", active === n.path && "bg-[#111]")}>
          <button onClick={() => setActive(n.path)}
            className="flex-1 min-w-0 text-left px-2 py-1 flex items-center gap-1 text-xs"
            style={{ paddingLeft: depth * 12 + 22 }}>
            <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate font-mono">{fname}</span>
          </button>
          <button onClick={() => onAddContext(n.path)}
            className="opacity-0 group-hover:opacity-100 mr-2 text-[10px] text-amber-500 hover:underline shrink-0" title="Add to prompt context">
            +context
          </button>
        </div>
      );
    });
  };

  return (
    <div className="h-full flex flex-col md:flex-row">
      <aside className="md:w-[35%] md:border-r border-b md:border-b-0 border-[#1e1e1e] overflow-y-auto scrollbar-thin bg-[#0a0a0a] max-h-60 md:max-h-none">
        {renderLevel("", 0)}
      </aside>
      <section className="flex-1 overflow-auto scrollbar-thin bg-[#080808]">
        {fileLoading && <PaneSkeleton />}
        {fileContent && (
          <>
            <div className="sticky top-0 px-3 py-2 border-b border-[#1e1e1e] bg-[#0a0a0a] flex items-center justify-between">
              <div className="text-xs font-mono text-foreground/90 truncate">{fileContent.path}</div>
              <div className="text-[10px] text-muted-foreground shrink-0">{fileContent.lines} lines</div>
            </div>
            <pre className="text-xs px-3 py-2 leading-relaxed" style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
              {fileContent.content.split("\n").map((line, i) => (
                <div key={i} className="flex gap-3">
                  <span className="select-none text-muted-foreground/40 w-8 text-right shrink-0">{i + 1}</span>
                  <span className="whitespace-pre-wrap break-all">{line || " "}</span>
                </div>
              ))}
            </pre>
          </>
        )}
        {!fileLoading && !fileContent && (
          <PaneEmpty icon={<FilesIcon className="h-8 w-8" />} text="Select a file to view its contents" />
        )}
      </section>
    </div>
  );
}

/* ---------- Logs pane ---------- */
function LogsPane({ job, onFixError }: { job: Job | null | undefined; onFixError: (msg: string) => void }) {
  if (!job) {
    return <PaneEmpty icon={<Terminal className="h-8 w-8" />} text="Logs will appear here when your AI engineer starts working 📋" />;
  }
  const ts = (s: string | null | undefined) => {
    try { return new Date(s ?? Date.now()).toLocaleTimeString(); } catch { return ""; }
  };
  const lines: { text: string; color: string; ts: string; error?: boolean }[] = [];
  const created = ts(job.created_at);
  const updated = ts(job.updated_at);
  lines.push({ text: "Reading your code...", color: stepState(job.status, 0) === "done" || stepState(job.status, 0) === "active" ? "text-emerald-400" : "text-muted-foreground", ts: created });
  if (["coding", "committing", "pr_opened", "failed"].includes(job.status))
    lines.push({ text: "Asking AI to make changes...", color: "text-emerald-400", ts: created });
  if (["committing", "pr_opened"].includes(job.status))
    lines.push({ text: "Saving the new version...", color: "text-emerald-400", ts: updated });
  if (job.status === "pr_opened")
    lines.push({ text: `Opened change request #${job.pr_number ?? "?"}`, color: "text-amber-400", ts: updated });
  if (job.last_message)
    lines.push({ text: job.last_message, color: "text-muted-foreground", ts: updated });
  if (job.error)
    lines.push({ text: job.error, color: "text-red-400", ts: updated, error: true });

  return (
    <div className="h-full overflow-auto scrollbar-thin bg-[#0a0a0a] p-3 text-xs" style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
      {lines.map((l, i) => (
        <div key={i} className={cn("py-1 flex items-start gap-3 group", l.color)}>
          <span className="text-muted-foreground/40 shrink-0">{l.ts}</span>
          <span className="flex-1 whitespace-pre-wrap break-all">{l.text}</span>
          {l.error && (
            <button onClick={() => onFixError(l.text)}
              className="opacity-0 group-hover:opacity-100 shrink-0 text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded hover:bg-amber-500/25">
              Fix with AI
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Change summary card ---------- */
function ChangeSummaryCard({ prompt }: { prompt: any }) {
  return (
    <div className="mx-4 md:mx-6 my-3 border border-[#1e1e1e] border-l-2 border-l-amber-500 rounded-lg bg-[#0f0f0f] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold">Your AI engineer just shipped an update</span>
      </div>
      {prompt.summary && (
        <p className="text-sm text-foreground/90 mb-3">{prompt.summary}</p>
      )}
      {Array.isArray(prompt.files_affected) && prompt.files_affected.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase text-muted-foreground mb-1">Files changed</div>
          <ul className="text-xs font-mono space-y-0.5">
            {prompt.files_affected.map((f: string) => (
              <li key={f} className="text-foreground/80">{f}</li>
            ))}
          </ul>
        </div>
      )}
      {Array.isArray(prompt.next_steps) && prompt.next_steps.length > 0 && (
        <div>
          <div className="text-[10px] uppercase text-muted-foreground mb-1">Suggested next steps</div>
          <ul className="text-xs space-y-1">
            {prompt.next_steps.map((s: string, i: number) => (
              <li key={i} className="text-foreground/80 flex gap-2"><span className="text-amber-500">→</span><span>{s}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Approval card ---------- */
function ApprovalCard({ onApprove, onRequestChanges, onReject }: any) {
  return (
    <div className="mx-4 md:mx-6 my-3 border border-amber-500/50 rounded-lg bg-[#0f0f0f] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
      <div className="text-center mb-4">
        <div className="text-base font-semibold mb-1">Ready to approve? 👀</div>
        <p className="text-sm text-muted-foreground">Review the changes in the Diff tab before pushing. You can't undo this.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <button onClick={onApprove}
          className="bg-amber-500 text-background px-4 py-2.5 rounded text-sm font-semibold hover:opacity-90 inline-flex items-center justify-center gap-1.5">
          <Check className="h-4 w-4" /> Approve & Push to GitHub
        </button>
        <button onClick={onRequestChanges}
          className="border border-[#2a2a2a] px-4 py-2.5 rounded text-sm hover:border-foreground inline-flex items-center justify-center gap-1.5">
          <Sparkles className="h-4 w-4" /> Request Changes
        </button>
        <button onClick={onReject}
          className="px-4 py-2.5 rounded text-sm text-muted-foreground hover:text-red-400 hover:bg-red-500/5 inline-flex items-center justify-center gap-1.5">
          <X className="h-4 w-4" /> Reject
        </button>
      </div>
    </div>
  );
}

/* ---------- Prompt dock ---------- */
function PromptDock({ value, onChange, onSubmit, disabled, running, blockedByOther, contextFiles, onRemoveContext, inputRef }: any) {
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!running && !disabled && value.trim()) onSubmit();
    }
  };
  return (
    <div className="border-t border-[#1e1e1e] bg-[#0a0a0a] p-3 md:p-4">
      {contextFiles?.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-2">
          {contextFiles.map((f: string) => (
            <span key={f} className="inline-flex items-center gap-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-0.5 text-[10px] font-mono">
              <FileIcon className="h-3 w-3 text-muted-foreground" />
              {f.split("/").pop()}
              <button onClick={() => onRemoveContext(f)} className="text-muted-foreground hover:text-foreground ml-1"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <textarea ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey}
            placeholder={running ? "Your AI engineer is working... ✋" : "Tell your AI engineer what to build..."}
            disabled={running || disabled}
            rows={2}
            className="w-full bg-[#111] border border-[#1e1e1e] rounded p-3 text-sm focus:outline-none focus:border-amber-500/50 disabled:opacity-60 resize-none transition" />
          <div className="text-[10px] text-muted-foreground text-right mt-1">
            {value.length} chars · ⌘+Enter to run
            {blockedByOther && <span className="text-amber-500 ml-2">Another change is in progress</span>}
          </div>
        </div>
        <button onClick={onSubmit} disabled={running || disabled || !value.trim()}
          className="bg-amber-500 text-background h-[68px] px-4 rounded font-semibold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run
        </button>
      </div>
    </div>
  );
}

/* ---------- Big empty state ---------- */
function CodeEmptyState({ hasRepo, value, onChange, onSubmit, inputRef }: any) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }} />
      <div className="relative text-center max-w-xl w-full">
        <div className="text-5xl mb-3">⚡</div>
        <h2 className="text-2xl font-semibold">Your AI engineer is ready</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Describe what you want to build or fix. YoFounder will make the changes, show you a preview, and wait for your approval before pushing to GitHub.
        </p>
        <div className="mt-6 flex gap-2">
          <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) onSubmit(); }}
            placeholder={hasRepo ? "What should we build first?" : "Connect your code first in settings..."}
            disabled={!hasRepo}
            className="flex-1 bg-[#111] border border-[#1e1e1e] rounded-lg px-4 py-3 text-base focus:outline-none focus:border-amber-500/50 disabled:opacity-60" />
          <button onClick={onSubmit} disabled={!hasRepo || !value.trim()}
            className="bg-amber-500 text-background px-5 rounded-lg font-semibold hover:opacity-90 disabled:opacity-30">
            Start
          </button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Your changes preview here before anything goes to GitHub</p>
      </div>
    </div>
  );
}

/* ---------- Shared helpers ---------- */
function PaneEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="h-full flex items-center justify-center text-center px-6">
      <div className="text-muted-foreground">
        <div className="opacity-50 mb-3 flex justify-center">{icon}</div>
        <p className="text-sm">{text}</p>
      </div>
    </div>
  );
}

function PaneSkeleton() {
  return (
    <div className="p-4 space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-3 bg-[#141414] rounded animate-pulse" style={{ width: `${60 + Math.random() * 35}%` }} />
      ))}
    </div>
  );
}

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
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
