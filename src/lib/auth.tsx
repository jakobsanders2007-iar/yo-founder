import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const Ctx = createContext<AuthCtx>({ user: null, session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const savedRef = useRef<string | null>(null);

  useEffect(() => {
    const captureGithub = async (sess: Session | null) => {
      // After GitHub OAuth, Supabase returns provider_token + user_metadata.user_name.
      // Persist to profiles so the rest of the app can use it.
      if (!sess?.user) return;
      const providerToken = (sess as any).provider_token as string | undefined;
      const userName = (sess.user.user_metadata as any)?.user_name as string | undefined;
      const provider = (sess.user.app_metadata as any)?.provider;
      if (provider !== "github" || !providerToken || !userName) return;
      const key = `${sess.user.id}:${userName}`;
      if (savedRef.current === key) return;
      savedRef.current = key;
      try {
        await supabase.from("profiles").upsert(
          { id: sess.user.id, github_username: userName, onboarded: true },
          { onConflict: "id" }
        );
        await supabase.from("profile_secrets").upsert(
          { user_id: sess.user.id, github_token: providerToken, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      } catch {
        /* non-fatal */
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setLoading(false);
      void captureGithub(sess);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      void captureGithub(data.session);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
