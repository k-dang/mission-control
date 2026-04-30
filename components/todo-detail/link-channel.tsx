import Link from "next/link";
import { ExternalLink, type LucideIcon } from "lucide-react";

export function LinkChannel({
  codename,
  channel,
  url,
  icon: Icon,
}: {
  codename: string;
  channel: string;
  url: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex items-center gap-4 border-l-2 border-border/30 bg-background/30 px-4 py-3 transition-all hover:border-primary/60 hover:bg-background/60"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border/30 bg-muted/30 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.24em] text-muted-foreground/60">
          <span>{codename}</span>
          <span className="text-muted-foreground/30">{"//"}</span>
          <span className="text-muted-foreground/80">{channel}</span>
        </div>
        <p className="mt-0.5 truncate font-mono text-[11px] text-foreground/85">
          {url.replace(/^https?:\/\//, "")}
        </p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}
