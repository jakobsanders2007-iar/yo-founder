import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/Card";
import { SetupStep } from "@/components/tabs/GithubTab";
import { ExternalLink, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  saveWorkspaceDomain, checkDomainLive, updateSetupProgress,
} from "@/lib/integrations.functions";

const CHECKLIST = [
  { key: "vercel_added", label: "Domain added in Vercel project settings" },
  { key: "a_record", label: "A record added in GoDaddy DNS" },
  { key: "cname_www", label: "CNAME www added in GoDaddy DNS" },
  { key: "ssl", label: "SSL certificate showing as active in Vercel" },
  { key: "live", label: "Site loads at your custom domain" },
];

export function DomainTab({ ws, onWsUpdate }: { ws: any; onWsUpdate: () => void }) {
  const saveDom = useServerFn(saveWorkspaceDomain);
  const check = useServerFn(checkDomainLive);
  const updateProg = useServerFn(updateSetupProgress);

  const step: number = ws.setup_progress?.domain ?? 0;
  const setStep = async (n: number) => {
    await updateProg({ data: { workspaceId: ws.id, key: "domain", step: n } });
    onWsUpdate();
  };

  const [dom, setDom] = useState(ws.godaddy_domain ?? "");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [liveResult, setLiveResult] = useState<{ live: boolean; status: number; checkedAt: string } | null>(
    ws.domain_last_status != null
      ? { live: ws.domain_last_status > 0 && ws.domain_last_status < 400, status: ws.domain_last_status, checkedAt: ws.domain_last_checked_at }
      : null
  );

  const [checks, setChecks] = useState<Record<string, boolean>>(ws.dns_checklist || {});

  const saveDomain = async () => {
    setBusy(true);
    try {
      await saveDom({ data: { workspaceId: ws.id, domain: dom.trim() } });
      toast.success("Domain saved");
      onWsUpdate();
      await setStep(2);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setBusy(false); }
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      const r = await check({ data: { workspaceId: ws.id } });
      setLiveResult(r);
      toast[r.live ? "success" : "error"](`HTTP ${r.status || "unreachable"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setChecking(false); }
  };

  const toggleCheck = async (key: string, v: boolean) => {
    const n = { ...checks, [key]: v };
    setChecks(n);
    await supabase.from("workspaces").update({ dns_checklist: n }).eq("id", ws.id);
  };

  if (!ws.godaddy_domain) {
    return (
      <div className="p-6 max-w-3xl space-y-6">
        <div className="text-xs text-muted-foreground">
          A custom domain (e.g. myapp.com) is your app's address. <span className="text-success">Cost</span>: ~$10–15/year on GoDaddy.
        </div>

        <SetupStep n={1} title="Get a domain on GoDaddy" done={step >= 1} active={step === 0}>
          <p className="text-sm text-muted-foreground mb-3">
            Browse and buy a domain. Use any name you want — keep it short.
          </p>
          <div className="flex gap-2 mb-4">
            <a href="https://www.godaddy.com/domains" target="_blank" rel="noreferrer" onClick={() => setStep(1)}
              className="bg-brand text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:opacity-90 inline-flex items-center gap-1.5">
              Browse on GoDaddy <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button onClick={() => setStep(1)} className="px-4 py-2 border border-border rounded text-sm hover:border-foreground">
              Skip for now
            </button>
          </div>
          <label className="text-xs text-muted-foreground">Enter your domain once purchased</label>
          <div className="flex gap-2 mt-1">
            <input value={dom} onChange={(e) => setDom(e.target.value)} placeholder="myapp.com"
              className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm font-mono" />
            <button onClick={saveDomain} disabled={busy || !dom.trim()}
              className="px-4 py-2 bg-brand text-primary-foreground rounded text-sm hover:opacity-90 disabled:opacity-50">
              Save
            </button>
          </div>
        </SetupStep>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <div className="text-3xl font-semibold">{ws.godaddy_domain}</div>
        <div className="flex gap-2 mt-3">
          <a href={`https://${ws.godaddy_domain}`} target="_blank" rel="noreferrer"
            className="border border-border rounded px-3 py-1.5 text-xs hover:border-foreground inline-flex items-center gap-1.5">
            Open Site <ExternalLink className="h-3 w-3" />
          </a>
          <button onClick={runCheck} disabled={checking}
            className="bg-brand text-primary-foreground rounded px-3 py-1.5 text-xs inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50">
            <RefreshCw className="h-3 w-3" /> {checking ? "Checking…" : "Check if live"}
          </button>
        </div>
        {liveResult && (
          <div className="text-xs text-muted-foreground mt-2">
            HTTP <span className={liveResult.live ? "text-success" : "text-error"}>{liveResult.status || "unreachable"}</span>
            {liveResult.checkedAt && <> · checked {new Date(liveResult.checkedAt).toLocaleString()}</>}
          </div>
        )}
      </div>

      <Card title="Point your domain to Vercel">
        <ol className="text-sm space-y-2 pl-5 list-decimal text-muted-foreground">
          <li>Open your Vercel project → <span className="font-mono text-foreground">Settings → Domains</span></li>
          <li>Click <span className="font-mono text-foreground">Add Domain</span> → type <span className="font-mono text-foreground">{ws.godaddy_domain}</span></li>
          <li>Vercel will show DNS records to add (an A record + a CNAME)</li>
          <li>Open GoDaddy → <span className="font-mono text-foreground">My Products → DNS</span> → your domain</li>
          <li>Add the records Vercel gave you</li>
          <li>Wait up to 24 hours for DNS to propagate</li>
        </ol>
      </Card>

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
