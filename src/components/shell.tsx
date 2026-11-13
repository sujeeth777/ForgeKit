"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TOOLS } from "@/lib/tools";
import type { ToolCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const CATEGORY_ORDER: Array<{ key: ToolCategory; label: string }> = [
  { key: "developer", label: "DEVELOPER" },
  { key: "security", label: "SECURITY" },
  { key: "network", label: "NETWORK" },
  { key: "logs", label: "LOGS" },
  { key: "linux", label: "LINUX" },
  { key: "architecture", label: "ARCHITECTURE" },
  { key: "cost", label: "COST" },
  { key: "labs", label: "LABS" },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/40 bg-accent/10 font-mono text-sm font-bold text-accent">
        FK
      </span>
      <span className="font-mono text-sm font-bold tracking-[0.2em] text-ink">
        FORGEKIT<span className="caret-blink text-accent">_</span>
      </span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* mobile topbar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-3 backdrop-blur lg:hidden no-print">
        <Logo />
        <button
          onClick={() => setOpen(!open)}
          className="rounded-md border border-line px-3 py-1.5 font-mono text-xs text-dim"
        >
          {open ? "✕ CLOSE" : "☰ MENU"}
        </button>
      </div>
      {open && (
        <nav className="border-b border-line bg-panel px-4 py-3 lg:hidden">
          <NavItems pathname={pathname} />
        </nav>
      )}

      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-panel/50 lg:flex no-print">
        <div className="border-b border-line px-4 py-4">
          <Logo />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavItems pathname={pathname} />
        </nav>
        <div className="border-t border-line px-4 py-3">
          <a
            href="https://github.com/sujeeth777/ForgeKit"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 font-mono text-[11px] text-faint transition-colors hover:text-accent"
          >
            <span>★ GitHub</span>
            <span className="text-line2">·</span>
            <span>MIT</span>
          </a>
        </div>
      </aside>
    </>
  );
}

function NavItems({ pathname }: { pathname: string }) {
  return (
    <div className="space-y-4">
      <NavItem
        href="/dashboard"
        icon="⌂"
        label="Overview"
        active={pathname === "/dashboard"}
      />
      {CATEGORY_ORDER.map((cat) => {
        const tools = TOOLS.filter((t) => t.category === cat.key);
        if (tools.length === 0) return null;
        return (
          <div key={cat.key}>
            <div className="mb-1 px-2 font-mono text-[10px] tracking-[0.2em] text-faint">
              {cat.label}
            </div>
            <div className="space-y-0.5">
              {tools.map((t) => (
                <NavItem
                  key={t.id}
                  href={`/dashboard/${t.id}`}
                  icon={t.icon}
                  label={t.name}
                  active={pathname === `/dashboard/${t.id}`}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-accent/10 font-medium text-accent"
          : "text-dim hover:bg-panel2 hover:text-ink",
      )}
    >
      <span className="w-5 text-center text-sm">{icon}</span>
      {label}
      {active && <span className="ml-auto font-mono text-[10px] text-accent">●</span>}
    </Link>
  );
}

export function Topbar({ title }: { title?: string }) {
  return (
    <div className="hidden items-center justify-between border-b border-line bg-bg/70 px-6 py-3 backdrop-blur lg:flex no-print">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
        {title ?? "ENGINEERING WORKSPACE"}
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded border border-accent/30 bg-accent/5 px-2 py-1 font-mono text-[10px] text-accent">
          LOCAL-FIRST · DATA STAYS IN YOUR BROWSER
        </span>
        <a
          href="https://github.com/sujeeth777/ForgeKit"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[11px] text-faint transition-colors hover:text-accent"
        >
          GitHub ↗
        </a>
      </div>
    </div>
  );
}
