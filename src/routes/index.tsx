import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "YoFounder — Vibe code with your co-founder" },
      { name: "description", content: "Two co-founders, two AIs, one workspace." },
    ],
  }),
});

function Index() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    navigate({ to: user ? "/dashboard" : "/login", replace: true });
  }, [user, loading, navigate]);
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Logo className="text-3xl" />
    </div>
  );
}
