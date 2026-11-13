import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ForgeKit — Developer & Security Toolkit",
    template: "%s · ForgeKit",
  },
  description:
    "One dashboard, dozens of engineering & security tools. Analyze repos, hunt leaked secrets, audit HTTP headers, map architecture, estimate costs — all in one place. Open-source core.",
  keywords: ["developer tools", "security tools", "secrets scanner", "HTTP security headers", "architecture diagram", "cost estimator"],
  authors: [{ name: "Sujeeth" }],
  openGraph: {
    title: "ForgeKit — Developer & Security Toolkit",
    description: "One dashboard. Dozens of engineering tools. Open-source core.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
