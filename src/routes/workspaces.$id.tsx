import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/UserAvatar";
import {
  respondAsSenderAi, generatePrompt,
  createGithubIssue,
} from "@/lib/yofounder.functions";
import { toast } from "sonner";
import {
  Github, Send, Sparkles, Copy, ExternalLink, ArrowLeft, X, Settings,
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

type Tab = "chat" | "prompts" | "github" | "vercel" | "supabase" | "domain";

function WorkspacePage() {
  const { id: workspaceId } = useParams({ from: "/workspaces/$id" });
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("chat");
  const [ws, setWs] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [promptDot, setPromptDot] = useState(false);

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

  // Presence heartbeat
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
            <a href={`https://github.com/${ws.github_repo}`} target="_blank" rel="noreferrer"
              className="hidden md:flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground">
              <Github className="h-3 w-3" /> {ws.github_repo}
            </a>
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
          {(["chat","prompts","github","vercel","supabase","domain"] as Tab[]).map((t) => (
            <button key={t} onClick={() => { setTab(t); if (t === "prompts") setPromptDot(false); }}
              className={cn(
                "relative px-3 md:px-4 py-2.5 text-xs uppercase tracking-wide transition border-b-2",
                tab === t ? "text-foreground border-brand" : "text-muted-foreground border-transparent hover:text-foreground"
              )}>
              {t}
              {t === "prompts" && promptDot && <span className="absolute top-2 right-1 h-1.5 w-1.5 rounded-full bg-brand" />}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 flex flex-col min-h-0">
        {tab === "chat" && <ChatTab workspaceId={workspaceId} user={user} members={members} ws={ws} />}
        {tab === "prompts" && <PromptsTab workspaceId={workspaceId} user={user} onNewPrompt={() => setPromptDot(true)} />}
        {tab === "github" && <GithubTab ws={ws} onWsUpdate={reloadWs} />}
        {tab === "vercel" && <VercelTab ws={ws} onWsUpdate={reloadWs} />}
        {tab === "supabase" && <SupabaseTab ws={ws} onWsUpdate={reloadWs} />}
        {tab === "domain" && <DomainTab ws={ws} onWsUpdate={reloadWs} />}
      </main>
    </div>
  );
}

/* ============ CHAT TAB ============ */
function ChatTab({ workspaceId, user, members }: any) {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState<{ name: string; provider: string; color: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [genResult, setGenResult] = useState<{ title: string; content: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const respondSender = useServerFn(respondAsSenderAi);
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
    const me = membersById[user.id];
    try {
      const { error } = await supabase.from("messages").insert({
        workspace_id: workspaceId, sender_user_id: user.id, sender_type: "human", content,
      });
      if (error) throw error;

      // notify others sender's AI is thinking
      await supabase.channel(`ws-${workspaceId}`).send({
        type: "broadcast", event: "typing",
        payload: { name: me?.display_name, provider: me?.ai_provider, color: me?.avatar_color },
      });

      respondSender({ data: { workspaceId } }).catch((e) => console.error(e));
    } catch (e: any) {
      toast.error(e?.message ?? "Send failed");
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
    const { error } = await supabase.from("prompts").insert({
      workspace_id: workspaceId, created_by: user.id,
      title: genResult.title, content: genResult.content,
    });
    if (error) return toast.error(error.message);
    toast.success("Saved to Prompts");
    setShowGenModal(false);
    setGenResult(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-6 py-6 space-y-4">
        {messages.map((m) => {
          const sender = membersById[m.sender_user_id];
          const color = sender?.avatar_color ?? "#666";
          const name = sender?.display_name ?? "?";
          const isAi = m.sender_type === "ai";
          const borderColor = m.ai_provider === "claude" ? "#6366f1" : m.ai_provider === "gpt" ? "#10b981" : "transparent";
          const label = isAi ? `${name}'s ${m.ai_provider === "claude" ? "Claude" : "GPT"}` : name;
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
            </div>
          );
        })}

        {typing && (
          <div className="flex gap-3 items-center text-xs text-muted-foreground">
            <Avatar name={typing.name} color={typing.color} size="sm" />
            <span>{typing.name}'s {typing.provider === "claude" ? "Claude" : "GPT"} is thinking</span>
            <span className="flex gap-1">
              <span className="typing-dot h-1.5 w-1.5 rounded-full" style={{ background: typing.color }} />
              <span className="typing-dot h-1.5 w-1.5 rounded-full" style={{ background: typing.color }} />
              <span className="typing-dot h-1.5 w-1.5 rounded-full" style={{ background: typing.color }} />
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-border bg-surface relative">
        <button onClick={generate} disabled={generating}
          className="absolute -top-12 right-4 inline-flex items-center gap-1.5 bg-brand text-primary-foreground text-xs font-medium px-3 py-2 rounded shadow-lg hover:opacity-90 disabled:opacity-50">
          <Sparkles className="h-3.5 w-3.5" /> {generating ? "Generating..." : "Generate Claude Code Prompt"}
        </button>
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
            rows={14}
            className="w-full bg-background border border-border rounded px-3 py-2 text-xs font-mono mb-4"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowGenModal(false)} className="px-4 py-2 border border-border rounded text-sm hover:border-foreground">Cancel</button>
            <button onClick={saveGenerated} className="px-4 py-2 bg-brand text-primary-foreground rounded text-sm hover:opacity-90">Save to Prompts</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============ PROMPTS TAB ============ */
function PromptsTab({ workspaceId, user, onNewPrompt }: any) {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const ghIssue = useServerFn(createGithubIssue);

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
          onNewPrompt?.();
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId]);

  useEffect(() => {
    if (selected) { setTitle(selected.title); setContent(selected.content); }
  }, [selected]);

  const newBlank = async () => {
    const { data, error } = await supabase.from("prompts").insert({
      workspace_id: workspaceId, created_by: user.id,
      title: "New prompt", content: "",
    }).select().single();
    if (error) return toast.error(error.message);
    setSelected(data);
  };

  const save = async () => {
    if (!selected) return;
    await supabase.from("prompts").update({ title, content }).eq("id", selected.id);
    toast.success("Saved");
  };

  const sendIssue = async () => {
    if (!selected) return;
    setSending(true);
    try {
      await supabase.from("prompts").update({ title, content }).eq("id", selected.id);
      const r = await ghIssue({ data: { workspaceId, promptId: selected.id } });
      toast.success(`Created issue #${r.issue_number}`);
      const { data } = await supabase.from("prompts").select("*").eq("id", selected.id).single();
      setSelected(data);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-1 flex min-h-0">
      <aside className="w-72 border-r border-border overflow-y-auto scrollbar-thin">
        <div className="p-3 border-b border-border">
          <button onClick={newBlank}
            className="w-full text-sm border border-border rounded py-2 hover:border-foreground">+ New Prompt</button>
        </div>
        <ul>
          {prompts.map((p) => (
            <li key={p.id}>
              <button onClick={() => setSelected(p)}
                className={cn("w-full text-left p-3 border-b border-border hover:bg-surface", selected?.id === p.id && "bg-surface")}>
                <div className="text-sm font-medium truncate">{p.title}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={cn("text-[10px] uppercase px-1.5 py-0.5 rounded",
                    p.status === "sent" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                    {p.status}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex-1 overflow-y-auto scrollbar-thin p-6">
        {!selected ? (
          <div className="text-muted-foreground text-sm">Select or create a prompt.</div>
        ) : (
          <>
            <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={save}
              className="w-full bg-transparent text-lg font-semibold border-b border-transparent hover:border-border focus:border-brand focus:outline-none pb-2 mb-4" />
            <textarea value={content} onChange={(e) => setContent(e.target.value)} onBlur={save}
              rows={20}
              className="w-full bg-background border border-border rounded p-3 text-xs font-mono focus:outline-none focus:border-brand" />
            <div className="mt-4 flex gap-2">
              <button onClick={sendIssue} disabled={sending}
                className="bg-brand text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
                <Github className="h-4 w-4" /> {sending ? "Sending..." : "Send to GitHub as Issue"}
              </button>
              <button onClick={() => { navigator.clipboard.writeText(content); toast.success("Copied"); }}
                className="px-4 py-2 border border-border rounded text-sm hover:border-foreground inline-flex items-center gap-1.5">
                <Copy className="h-4 w-4" /> Copy Prompt
              </button>
            </div>
            {selected.status === "sent" && selected.github_issue_url && (
              <div className="mt-6 border border-success/30 bg-success/5 rounded p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Issue #{selected.github_issue_number}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Paste this prompt into Claude Code or Cursor pointed at your repo to implement.
                    </div>
                  </div>
                  <a href={selected.github_issue_url} target="_blank" rel="noreferrer"
                    className="text-xs inline-flex items-center gap-1 text-success hover:underline">
                    View on GitHub <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </section>
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
