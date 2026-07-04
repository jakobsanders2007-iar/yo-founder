import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { completeSupabaseMgmtOAuth } from "@/lib/integrations.functions";
import { Database, Loader2, Check, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/auth/supabase/callback")({
  component: SupabaseCallback,
  head: () => ({ meta: [{ title: "Connecting Supabase…" }] }),
});

function SupabaseCallback() {
  const navigate = useNavigate();
  const complete = useServerFn(completeSupabaseMgmtOAuth);
  const [status, setStatus] = useState<"working" | "ok" | "err">("working");
  const [msg, setMsg] = useState<string>("");
  const [wsId, setWsId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");
        const err = params.get("error_description") || params.get("error");
        if (err) throw new Error(err);
        if (!code || !state) throw new Error("Missing code or state");
        const res = await complete({ data: { code, state, origin: window.location.origin } });
        setStatus("ok");
        setWsId(res.workspaceId);
        setTimeout(() => navigate({ to: "/workspaces/$id", params: { id: res.workspaceId } }), 1000);
      } catch (e: any) {
        setStatus("err");
        setMsg(e?.message ?? "Supabase connection failed");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-surface border border-border rounded-lg p-8 text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-foreground/5 flex items-center justify-center mb-4">
          <Database className="h-7 w-7" />
        </div>
        {status === "working" && (
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Connecting Supabase…
          </div>
        )}
        {status === "ok" && (
          <>
            <div className="inline-flex items-center gap-2 text-success">
              <Check className="h-5 w-5" /> Supabase connected
            </div>
            <p className="text-xs text-muted-foreground mt-2">Loading your projects…</p>
          </>
        )}
        {status === "err" && (
          <>
            <div className="inline-flex items-center gap-2 text-error">
              <AlertCircle className="h-5 w-5" /> {msg}
            </div>
            <button onClick={() => wsId ? navigate({ to: "/workspaces/$id", params: { id: wsId } }) : navigate({ to: "/dashboard" })} className="mt-4 px-4 py-2 border border-border rounded text-sm hover:border-foreground">
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
