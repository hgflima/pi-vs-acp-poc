export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 py-2">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-pulse" style={{ animationDelay: "0ms" }} />
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-pulse" style={{ animationDelay: "150ms" }} />
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-pulse" style={{ animationDelay: "300ms" }} />
    </div>
  );
}
