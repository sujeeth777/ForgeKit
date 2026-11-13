import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/types";
import type { ReactNode } from "react";

/* ---------- layout primitives ---------- */

export function Card({
  children,
  className,
  title,
  subtitle,
  right,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-line bg-panel/80 backdrop-blur-sm",
        className,
      )}
    >
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-mono text-[13px] font-semibold tracking-wide text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-dim">{subtitle}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-panel/80 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-2xl font-bold",
          accent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-dim">{hint}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "green" | "amber" | "red" | "blue";
  className?: string;
}) {
  const tones = {
    default: "border-line2 text-dim",
    green: "border-accent/40 text-accent bg-accent/10",
    amber: "border-warn/40 text-warn bg-warn/10",
    red: "border-danger/40 text-danger bg-danger/10",
    blue: "border-info/40 text-info bg-info/10",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const SEVERITY_TONE: Record<Severity, "red" | "amber" | "blue" | "default"> = {
  critical: "red",
  high: "red",
  medium: "amber",
  low: "blue",
  info: "default",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge tone={SEVERITY_TONE[severity]}>{severity}</Badge>;
}

/* ---------- controls ---------- */

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "outline";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const styles = {
    primary:
      "bg-accent text-[#04110a] font-semibold hover:bg-accent/90 disabled:bg-accent/40",
    ghost: "text-dim hover:text-ink hover:bg-panel2",
    outline: "border border-line2 text-ink hover:border-accent/60 hover:text-accent",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 font-mono text-xs tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  label?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
          {label}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent/60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  label,
  className,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  onEnter?: () => void;
}) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
          {label}
        </span>
      )}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className="w-full rounded-md border border-line bg-panel2 px-3 py-2 text-sm text-ink placeholder:text-faint outline-none transition-colors focus:border-accent/60"
      />
    </label>
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  label,
  rows = 8,
  className,
  mono = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  rows?: number;
  className?: string;
  mono?: boolean;
}) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
          {label}
        </span>
      )}
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className={cn(
          "w-full resize-y rounded-md border border-line bg-panel2 px-3 py-2 text-sm text-ink placeholder:text-faint outline-none transition-colors focus:border-accent/60",
          mono && "font-mono text-xs leading-relaxed",
        )}
      />
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-dim hover:text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-line2 bg-panel2 accent-[#34d399]"
      />
      {label}
    </label>
  );
}

/* ---------- display ---------- */

export function ScoreBar({ score }: { score: number }) {
  const tone = score >= 80 ? "bg-accent" : score >= 50 ? "bg-warn" : "bg-danger";
  const textTone = score >= 80 ? "text-accent" : score >= 50 ? "text-warn" : "text-danger";
  return (
    <div className="flex items-center gap-3">
      <div className="font-mono text-3xl font-bold text-ink">
        {score}
        <span className="text-base text-faint">/100</span>
      </div>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-panel2">
        <div
          className={cn("h-full rounded-full transition-all duration-500", tone)}
          style={{ width: `${Math.max(score, 2)}%` }}
        />
      </div>
      <span className={cn("font-mono text-xs", textTone)}>
        {score >= 80 ? "GOOD" : score >= 50 ? "NEEDS WORK" : "AT RISK"}
      </span>
    </div>
  );
}

export function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-md border border-line bg-[#070b10] p-4 font-mono text-xs leading-relaxed text-dim",
        className,
      )}
    >
      {code}
    </pre>
  );
}

export function KVTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full text-left text-sm">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-panel2/50" : ""}>
              <td className="w-1/3 border-r border-line px-3 py-1.5 align-top font-mono text-xs text-faint">
                {k}
              </td>
              <td className="break-all px-3 py-1.5 text-dim">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line py-14 text-center">
      <div className="text-3xl opacity-60">{icon}</div>
      <p className="mt-3 max-w-md text-sm text-faint">{text}</p>
    </div>
  );
}

export function Spinner({ label = "Running…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-dim">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line2 border-t-accent" />
      <span className="font-mono text-xs">{label}</span>
    </div>
  );
}

export function ToolHeader({
  icon,
  name,
  tagline,
  privacy,
}: {
  icon: string;
  name: string;
  tagline: string;
  privacy: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-line2 bg-panel2 text-xl">
          {icon}
        </div>
        <div>
          <h1 className="font-mono text-xl font-bold tracking-wide text-ink">
            {name}
          </h1>
          <p className="mt-0.5 text-sm text-dim">{tagline}</p>
        </div>
      </div>
      <Badge tone="green">{privacy}</Badge>
    </div>
  );
}
