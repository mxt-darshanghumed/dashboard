import type { CSSProperties } from "react";
import type { JiraStatusCategory } from "@/lib/api";

export type StatusKind =
  | "qa"
  | "review"
  | "devDone"
  | "inProgress"
  | "blocked"
  | "closed"
  | "todo";

const HUES: Record<StatusKind, number> = {
  qa: 150,
  review: 285,
  devDone: 200,
  inProgress: 75,
  blocked: 25,
  closed: 270,
  todo: 230,
};

export function classifyStatus(name: string, category: JiraStatusCategory): StatusKind {
  const n = name.toLowerCase();
  if (/blocked|hold|impediment/.test(n)) return "blocked";
  if (/(qa|test|verif|check).*pass|pass.*(qa|test|verif)|checked by qa|qa\s*done|tested/.test(n))
    return "qa";
  if (/qa|test|verif/.test(n) && category !== "new") return "qa";
  if (/code\s*review|in\s*review|peer\s*review|review/.test(n)) return "review";
  if (/dev\s*done|ready\s*for|handover|hand\s*off|to\s*deploy/.test(n)) return "devDone";
  if (/progress|working|develop|wip/.test(n)) return "inProgress";
  if (/closed|done|resolved|completed|cancel|reject/.test(n)) return "closed";
  if (category === "indeterminate") return "inProgress";
  if (category === "done") return "closed";
  return "todo";
}

export function statusHue(name: string, category: JiraStatusCategory): number {
  return HUES[classifyStatus(name, category)];
}

export function statusCardBackground(name: string, category: JiraStatusCategory): string {
  const h = statusHue(name, category);
  return `linear-gradient(180deg, oklch(0.245 0.035 ${h}), oklch(0.22 0.024 ${h}))`;
}

export function statusPillStyle(name: string, category: JiraStatusCategory): CSSProperties {
  const h = statusHue(name, category);
  return {
    color: `oklch(0.86 0.15 ${h})`,
    borderColor: `color-mix(in oklch, oklch(0.7 0.18 ${h}) 45%, transparent)`,
    background: `color-mix(in oklch, oklch(0.7 0.18 ${h}) 10%, transparent)`,
  };
}

export function statusChipActiveStyle(name: string, category: JiraStatusCategory): CSSProperties {
  const h = statusHue(name, category);
  return {
    color: `oklch(0.88 0.15 ${h})`,
    borderColor: `color-mix(in oklch, oklch(0.7 0.18 ${h}) 55%, transparent)`,
    background: `color-mix(in oklch, oklch(0.7 0.18 ${h}) 15%, transparent)`,
  };
}
