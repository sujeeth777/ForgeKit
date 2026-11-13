import Link from "next/link";
import { TOOLS } from "@/lib/tools";
import { Badge } from "@/components/ui";

const PHASES = [
  { phase: "Phase 0", name: "Foundation", status: "✓ shipped", desc: "Next.js app · dashboard shell · unified ToolRun + Report model" },
  { phase: "Phase 1", name: "First 5 tools", status: "✓ shipped", desc: "SecretSentry · EnvDoctor · HTTPGuard · ArchMap · WebCost" },
  { phase: "Phase 2", name: "Developer tools", status: "✓ shipped", desc: "Repo Analyzer · DepWatch · LogForge · LinuxLens · NetPeek" },
  { phase: "Phase 3", name: "Security lab", status: "✓ shipped", desc: "AttackGraph (defensive) · AuthLab · standardized reports" },
  { phase: "Phase 4", name: "Website intelligence", status: "✓ shipped", desc: "SiteBlueprint — pages, features, stack, milestones" },
  { phase: "Phase 5", name: "Ecosystem", status: "next", desc: "Auth + Postgres · CLI · plugin API · hosted service" },
];

export default function LandingPage() {
  return (
    <div className="relative z-10">
      {/* topbar */}
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/40 bg-accent/10 font-mono text-sm font-bold text-accent">
            FK
          </span>
          <span className="font-mono text-sm font-bold tracking-[0.2em]">
            FORGEKIT<span className="caret-blink text-accent">_</span>
          </span>
        </div>
        <nav className="flex items-center gap-4">
          <a
            href="https://github.com/sujeeth777/ForgeKit"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-dim hover:text-accent"
          >
            GITHUB ↗
          </a>
          <Link
            href="/dashboard"
            className="rounded-md bg-accent px-4 py-2 font-mono text-xs font-semibold text-[#04110a] hover:bg-accent/90"
          >
            OPEN DASHBOARD →
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        {/* hero */}
        <section className="py-20 text-center">
          <Badge tone="green" className="mb-6">
            OPEN SOURCE · MIT · SELF-HOSTABLE
          </Badge>
          <h1 className="mx-auto max-w-3xl font-mono text-4xl font-bold leading-tight tracking-wide sm:text-5xl">
            One dashboard.
            <br />
            <span className="text-accent">Dozens of engineering tools.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-dim">
            Analyze repositories, hunt leaked secrets, audit HTTP security headers, map
            architectures, estimate website costs, learn Linux — all from one place.
            The core is open source and every tool that can, runs{" "}
            <span className="font-mono text-ink">locally in your browser</span>.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-md bg-accent px-6 py-3 font-mono text-sm font-semibold text-[#04110a] transition-colors hover:bg-accent/90"
            >
              LAUNCH DASHBOARD →
            </Link>
            <a
              href="https://github.com/sujeeth777/ForgeKit"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-line2 px-6 py-3 font-mono text-sm text-ink transition-colors hover:border-accent/60 hover:text-accent"
            >
              ★ STAR ON GITHUB
            </a>
          </div>
          <div className="mx-auto mt-10 max-w-3xl text-left">
            <pre className="overflow-x-auto rounded-lg border border-line bg-[#070b10] p-5 font-mono text-[11px] leading-relaxed text-faint">
{`$ visit forgekit dashboard
> choose a tool → run → analyze → export report
> scans run locally · secrets are never displayed · reports export MD/JSON/PDF`}
            </pre>
          </div>
        </section>

        {/* tools grid */}
        <section className="pb-20">
          <h2 className="mb-2 text-center font-mono text-xs uppercase tracking-[0.25em] text-faint">
            {TOOLS.length} tools live in v0.1
          </h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((t) => (
              <Link
                key={t.id}
                href={`/dashboard/${t.id}`}
                className="group rounded-lg border border-line bg-panel/60 p-4 transition-all hover:border-accent/50 hover:bg-panel"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl">{t.icon}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                    {t.runsIn === "browser" ? "● local" : "● server"}
                  </span>
                </div>
                <h3 className="mt-3 font-mono text-sm font-semibold text-ink group-hover:text-accent">
                  {t.name}
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-dim">{t.tagline}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* architecture */}
        <section className="pb-20">
          <div className="rounded-xl border border-line bg-panel/60 p-8">
            <h2 className="mb-6 text-center font-mono text-xs uppercase tracking-[0.25em] text-faint">
              How ForgeKit fits together
            </h2>
            <pre className="overflow-x-auto text-center font-mono text-[11px] leading-relaxed text-dim sm:text-xs">
{`                    FORGEKIT
                       │
        ┌──────────────┼──────────────┐
     DEVELOPER      SECURITY      ARCHITECTURE
        │              │              │
  Repo Analyzer   SecretSentry   ArchMap
  EnvDoctor       HTTPGuard      SiteBlueprint
  DepWatch        AttackGraph    WebCost
  LogForge        AuthLab
  LinuxLens       NetPeek
        │              │              │
        └──────────────┼──────────────┘
                       ▼
              UNIFIED TOOL RUN + REPORT
        score · findings · sections · exports
                       │
                       ▼
          localStorage (v0.1, local-first)
          → Postgres + workers (Phase 5)`}
            </pre>
          </div>
        </section>

        {/* roadmap */}
        <section className="pb-20">
          <h2 className="mb-8 text-center font-mono text-xs uppercase tracking-[0.25em] text-faint">
            Roadmap — built in phases
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {PHASES.map((p) => (
              <div
                key={p.phase}
                className="flex items-start gap-4 rounded-lg border border-line bg-panel/60 p-4"
              >
                <Badge tone={p.status === "✓ shipped" ? "green" : "amber"}>{p.phase}</Badge>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">
                    {p.name}
                    <span
                      className={`ml-2 font-mono text-[10px] uppercase ${
                        p.status === "✓ shipped" ? "text-accent" : "text-warn"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-dim">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-6 py-8 text-center">
        <p className="font-mono text-[11px] text-faint">
          ForgeKit — open-source core (MIT) ·{" "}
          <a
            href="https://github.com/sujeeth777/ForgeKit"
            target="_blank"
            rel="noopener noreferrer"
            className="text-dim hover:text-accent"
          >
            github.com/sujeeth777/ForgeKit
          </a>
        </p>
        <p className="mt-2 text-[11px] text-faint">
          Security tools are for defensive use on systems you own or are authorized to test.
        </p>
      </footer>
    </div>
  );
}
