import type { LucideIcon } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  upcoming: string[];
}

export function Placeholder({ icon: Icon, title, description, upcoming }: Props) {
  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex items-center justify-center">
          <Icon className="w-5 h-5 text-[var(--color-accent)]" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      <p className="text-[var(--color-fg-muted)] max-w-xl mb-6">{description}</p>

      <Card>
        <CardTitle>Coming next</CardTitle>
        <CardDescription className="mt-2 mb-3">
          Bespoke layout for this workflow. For now, you can run the generic version from the Dashboard.
        </CardDescription>
        <ul className="space-y-2 mt-3">
          {upcoming.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-[var(--color-fg-muted)]">
              <span className="mt-2 w-1 h-1 rounded-full bg-[var(--color-fg-dim)] shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
