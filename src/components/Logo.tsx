import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-sans tracking-tight text-brand", className)}>
      <span className="font-extrabold">Yo</span>
      <span className="font-light">Founder</span>
    </span>
  );
}
