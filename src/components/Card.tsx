import { cn } from "@/lib/utils";

export function Card({
  title,
  children,
  className,
  right,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className={cn("bg-surface border border-border rounded-lg p-5", className)}>
      {(title || right) && (
        <div className="flex items-center justify-between mb-3">
          {title && (
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {title}
            </div>
          )}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full",
        ok ? "bg-success" : "bg-muted-foreground/50"
      )}
    />
  );
}
