import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  GitPullRequest,
  Ticket,
  ClipboardCheck,
  Sparkles,
  Settings,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/prs", label: "Pull Requests", icon: GitPullRequest },
  { to: "/jira", label: "Jira", icon: Ticket },
  { to: "/worklog", label: "Worklog", icon: ClipboardCheck },
];

export function Sidebar() {
  return (
    <aside className="w-64 shrink-0 h-screen border-r border-[var(--color-border-subtle)] bg-[var(--color-bg)] flex flex-col">
      <div className="px-5 py-5 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--color-accent)] to-[oklch(0.6_0.2_310)] flex items-center justify-center ring-accent-soft">
            <Sparkles className="w-4 h-4 text-[var(--color-accent-fg)]" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Cockpit</div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-fg-dim)]">
              agent OS
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <div className="px-2 mb-2 text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)] font-medium">
          Workspace
        </div>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 h-9 rounded-[var(--radius-md)] text-sm transition-colors",
                isActive
                  ? "bg-[var(--color-bg-elevated)] text-[var(--color-fg)]"
                  : "text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-fg)]"
              )
            }
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <div className="px-2 mt-6 mb-2 text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)] font-medium">
          Create
        </div>
        <NavLink
          to="/new-agent"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-3 h-9 rounded-[var(--radius-md)] text-sm transition-colors",
              isActive
                ? "bg-[var(--color-bg-elevated)] text-[var(--color-fg)]"
                : "text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-fg)]"
            )
          }
        >
          <Plus className="w-4 h-4" />
          <span>New agent</span>
        </NavLink>
      </nav>

      <div className="px-3 py-4 border-t border-[var(--color-border-subtle)]">
        <NavLink
          to="/settings"
          className="flex items-center gap-3 px-3 h-9 rounded-[var(--radius-md)] text-sm text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-fg)] transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  );
}
