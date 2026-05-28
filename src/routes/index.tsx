import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "YoFounder — Vibe code with your co-founder" },
      { name: "description", content: "The multiplayer AI workspace for SaaS founders. Chat, code, and ship together." },
      { property: "og:title", content: "YoFounder — Vibe code with your co-founder" },
      { property: "og:description", content: "The multiplayer AI workspace for SaaS founders. Chat, code, and ship together." },
      { property: "og:url", content: "https://yo-founder.com" },
      { property: "og:image", content: "https://yo-founder.com/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://yo-founder.com/og-image.png" },
    ],
    links: [
      { rel: "canonical", href: "https://yo-founder.com" },
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
