import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Check, Database } from "lucide-react";
import { toast } from "sonner";

export function SupabaseTab({ ws, onWsUpdate }: { ws: any; onWsUpdate: () => void }) {
  const [url, setUrl] = useState(ws.supabase_project_url ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const v = url.trim();
    if (!v) return;
    if (!/^https?:\/\//.test(v)) return toast.error("Please paste a full URL starting with https://");
    setBusy(true);
    const { error } = await supabase.from("workspaces")
      .update({ supabase_project_url: v })
      .eq("id", ws.id);
    setBusy(false);
    if (error) return toast.error("Couldn't save — please try again");
    toast.success("Your data storage is saved ✓");
    setEditing(false);
    onWsUpdate();
  };

  // ───────── Connected ─────────
  if (ws.supabase_project_url && !editing) {
    return (
      <div className="p-6 max-w-3xl space-y-6">
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-success">
              <Check className="h-3.5 w-3.5" /> Data storage connected
            </span>
          </div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Your data storage</div>
          <a
            href={ws.supabase_project_url}
            target="_blank"
            rel="noreferrer"
            className="text-lg font-mono text-brand hover:underline inline-flex items-center gap-2 break-all"
          >
            {ws.supabase_project_url.replace(/^https?:\/\//, "")}
            <ExternalLink className="h-4 w-4 shrink-0" />
          </a>
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={ws.supabase_project_url}
              target="_blank"
              rel="noreferrer"
              className="bg-brand text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:opacity-90 inline-flex items-center gap-1.5"
            >
              Open my data storage <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 border border-border rounded text-sm hover:border-foreground"
            >
              Change
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ───────── Not connected ─────────
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-surface border border-border rounded-lg p-10 text-center">
        <div className="mx-auto h-20 w-20 rounded-full bg-foreground/5 flex items-center justify-center mb-5">
          <Database className="h-10 w-10" />
        </div>
        <h2 className="text-xl font-semibold">Set up your data storage 🗄️</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
          Think of it like a spreadsheet your app uses to remember everything — your users, their info, all of it. It's free.
        </p>
        <a
          href="https://supabase.com"
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex items-center justify-center gap-2 bg-brand text-primary-foreground font-semibold px-6 py-3 rounded-lg text-base hover:opacity-90"
        >
          Set up Supabase <ExternalLink className="h-4 w-4" />
        </a>
        <p className="mt-3 text-xs text-muted-foreground">
          Sign up with the same GitHub account you used here.
        </p>

        <div className="mt-8 pt-6 border-t border-border text-left">
          <p className="text-sm text-muted-foreground mb-3">
            Come back here after Supabase finishes and paste your project URL below 👇
          </p>
          <label className="text-xs text-muted-foreground">Your project URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://xxxx.supabase.co"
            className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Supabase shows this in your project under Settings → API.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={save}
              disabled={busy || !url.trim()}
              className="bg-brand text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save my project URL"}
            </button>
            {editing && (
              <button
                onClick={() => { setEditing(false); setUrl(ws.supabase_project_url ?? ""); }}
                className="px-4 py-2 border border-border rounded text-sm hover:border-foreground"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
