import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  color: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
  className?: string;
}

export function Avatar({ name, color, size = "md", online, className }: AvatarProps) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const sizeClass =
    size === "sm" ? "h-7 w-7 text-xs" :
    size === "lg" ? "h-12 w-12 text-base" :
    "h-9 w-9 text-sm";
  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-full font-semibold text-white",
          sizeClass,
          online === undefined ? "" : online ? "ring-2 ring-success ring-offset-2 ring-offset-background" : "ring-2 ring-border ring-offset-2 ring-offset-background"
        )}
        style={{ backgroundColor: color }}
      >
        {initial}
      </div>
    </div>
  );
}
