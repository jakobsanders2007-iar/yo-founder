import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { acceptInvite } from "@/lib/yofounder.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
  head: () => ({ meta: [{ title: "Join Workspace — YoFounder" }] }),
});

function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [info, setInfo] = useState<{ workspace_name: string; inviter: string; accepted: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accept = useServerFn(acceptInvite);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("workspace_invites")
        .select("accepted, workspaces(name), profiles:invited_by(display_name)")
        .eq("token", token).single();
      if (error || !data) { setErr("Invite not found"); return; }
      setInfo({
        workspace_name: (data.workspaces as any)?.name ?? "?",
        inviter: (data.profiles as any)?.display_name ?? "Someone",
        accepted: data.accepted,
      });
    })();
  }, [token]);

  const join = async () => {
    if (!user) {
      sessionStorage.setItem("pending_invite", token);
      navigate({ to: "/login" });
      return;
    }
    setBusy(true);
    try {
      const r = await accept({ data: { token } });
      navigate({ to: "/workspaces/$id", params: { id: r.workspaceId } });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to join");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <Logo className="text-3xl" />
        <div className="mt-8 bg-surface border border-border rounded-lg p-8">
          {err ? <p className="text-error text-sm">{err}</p> :
            !info ? <p className="text-muted-foreground text-sm">Loading...</p> :
            info.accepted ? <p className="text-muted-foreground text-sm">This invite was already used.</p> :
            <>
              <p className="text-sm text-muted-foreground">{info.inviter} invited you to join</p>
              <h1 className="text-2xl font-semibold mt-2">{info.workspace_name}</h1>
              <button onClick={join} disabled={busy || loading}
                className="mt-8 w-full bg-brand text-primary-foreground font-medium py-2.5 rounded text-sm hover:opacity-90 disabled:opacity-50">
                {busy ? "..." : "Join Workspace"}
              </button>
            </>
          }
        </div>
      </div>
    </div>
  );
}
