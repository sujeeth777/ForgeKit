import { Sidebar, Topbar } from "@/components/shell";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative z-10 flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
        <footer className="border-t border-line px-6 py-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-faint no-print">
          ForgeKit v0.1 · Open-source core · MIT
        </footer>
      </div>
    </div>
  );
}
