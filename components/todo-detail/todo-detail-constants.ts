import type { CSSProperties } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  CheckCircle2,
  Circle,
  RotateCw,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type Status = Doc<"todos">["status"];
export type DossierStyle = CSSProperties & { "--dossier-accent": string };

export const STATUS_META: Record<
  Status,
  {
    label: string;
    codename: string;
    textClass: string;
    accent: string;
    accentSoft: string;
    accentGlow: string;
    icon: LucideIcon;
  }
> = {
  TODO: {
    label: "STANDBY",
    codename: "CODE-01 / STANDBY",
    textClass: "text-col-todo",
    accent: "oklch(0.75 0.15 55)",
    accentSoft: "oklch(0.75 0.15 55 / 14%)",
    accentGlow: "oklch(0.75 0.15 55 / 22%)",
    icon: Circle,
  },
  INPROGRESS: {
    label: "IN FLIGHT",
    codename: "CODE-02 / IN-FLIGHT",
    textClass: "text-col-inprogress",
    accent: "oklch(0.65 0.17 250)",
    accentSoft: "oklch(0.65 0.17 250 / 14%)",
    accentGlow: "oklch(0.65 0.17 250 / 22%)",
    icon: RotateCw,
  },
  COMPLETED: {
    label: "RECOVERED",
    codename: "CODE-03 / RECOVERED",
    textClass: "text-col-completed",
    accent: "oklch(0.68 0.14 155)",
    accentSoft: "oklch(0.68 0.14 155 / 14%)",
    accentGlow: "oklch(0.68 0.14 155 / 22%)",
    icon: CheckCircle2,
  },
  FAILED: {
    label: "LOST",
    codename: "CODE-04 / SIGNAL-LOST",
    textClass: "text-col-failed",
    accent: "oklch(0.62 0.2 25)",
    accentSoft: "oklch(0.62 0.2 25 / 14%)",
    accentGlow: "oklch(0.62 0.2 25 / 22%)",
    icon: XCircle,
  },
};

export const TITLE_DIVIDER_TICKS = Array.from({ length: 48 }, (_, i) => ({
  height: i % 8 === 0 ? "100%" : i % 4 === 0 ? "60%" : "35%",
  opacity: i % 8 === 0 ? 0.8 : 0.35,
}));

export function formatAbsoluteTimestamp(ms: number) {
  const d = new Date(ms);
  const iso = d.toISOString();
  return iso.replace("T", " ").slice(0, 19) + "Z";
}
