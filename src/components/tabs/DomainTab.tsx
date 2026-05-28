import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/Card";
import { ExternalLink, Check } from "lucide-react";
import { toast } from "sonner";

const CHECKLIST = [
  { key: "vercel_added", label: "Added my domain in Vercel settings" },
  { key: "dns_records", label: "Added DNS records at GoDaddy" },
  { key: "live", label: "My app loads at my custom domain ✓" },
];

export function DomainTab({ ws, onWsUpdate }: { ws: any; onWsUpdate: () => void }) {
  const [dom, setDom] = useState(ws.godaddy_domain ?? "");
  const [notes, setNotes] = useState(ws.dns_notes ?? "");
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>(ws.dns_checklist || {});

  const saveDomain = async () => {
    const v = dom.trim();
    if (!v) return;
    setBusy(true);
    const { error } = await supabase.from("workspaces")
      .update({ godaddy_domain: v })
      .eq("id", ws.id);
    setBusy(false);
    if (error) return toast.error("Couldn't save — please try again");
    toast.success("Domain saved ✓");
    onWsUpdate();
  };

  const toggleCheck = async (key: string, v: boolean) => {
    const n = { ...checks, [key]: v };
    setChecks(n);
    await supabase.from("workspaces").update({ dns_checklist: n }).eq("id", ws.id);
  };

  const saveNotes = async () => {
    await supabase.from("workspaces").update({ dns_notes: notes }).eq("id", ws.id);
    toast.success("Notes saved ✓");
  };

  if (!ws.godaddy_domain) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-surface border border-border rounded-lg p-8">
          <h2 className="text-xl font-semibold">Your custom domain</h2>
          <p className="text-sm text-muted-foreground mt-2">
            A custom domain (like <span className="font-mono">myapp.com</span>) is your app's friendly address.
          </p>

          <label className="text-xs text-muted-foreground mt-6 block">What's your domain?</label>
          <input
            value={dom}
            onChange={(e) => setDom(e.target.value)}
            placeholder="yo-founder.com"
            className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
          />
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <button
              onClick={saveDomain}
              disabled={busy || !dom.trim()}
              className="bg-brand text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save my domain"}
            </button>
            <a
              href="https://www.godaddy.com/domains"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Don't have one yet? Get one at GoDaddy <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <div className="text-3xl font-semibold">{ws.godaddy_domain}</div>
        <div className="flex gap-2 mt-3">
          <a href={`https://${ws.godaddy_domain}`} target="_blank" rel="noreferrer"
            className="bg-brand text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:opacity-90 inline-flex items-center gap-1.5">
            Visit {ws.godaddy_domain} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <Card title="DNS checklist">
        <ul className="space-y-2">
          {CHECKLIST.map((c) => (
            <li key={c.key}>
              <label className="flex items-center gap-3 cursor-pointer text-sm">
                <input type="checkbox" checked={!!checks[c.key]} onChange={(e) => toggleCheck(c.key, e.target.checked)}
                  className="accent-brand h-4 w-4" />
                <span className={checks[c.key] ? "line-through text-muted-foreground" : ""}>{c.label}</span>
                {checks[c.key] && <Check className="h-3.5 w-3.5 text-success" />}
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Notes & reminders">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={4}
          placeholder="Anything you want to remember about your domain setup..."
          className="w-full bg-background border border-border rounded p-3 text-sm focus:outline-none focus:border-brand"
        />
        <p className="text-xs text-muted-foreground mt-2">Saves automatically when you click away.</p>
      </Card>

      <Card title="Change domain">
        <div className="flex gap-2">
          <input value={dom} onChange={(e) => setDom(e.target.value)}
            className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm font-mono" />
          <button onClick={saveDomain} disabled={busy || !dom.trim() || dom === ws.godaddy_domain}
            className="px-4 py-2 border border-border rounded text-sm hover:border-foreground disabled:opacity-50">
            Update
          </button>
        </div>
      </Card>
    </div>
  );
}
