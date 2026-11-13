import type { Finding, Report } from "@/lib/types";
import { getTool } from "@/lib/tools";
import { formatBytes } from "@/lib/utils";

/**
 * Repo Analyzer — static analysis of a list of files (extracted from a ZIP
 * in the browser). No code is executed; nothing is uploaded anywhere.
 */

export interface RepoFile {
  path: string;
  size: number;
  content?: string; // text files only
}

export interface LanguageStat {
  language: string;
  bytes: number;
  files: number;
  share: number; // 0-100 of code bytes
}

export interface RepoAnalysis {
  report: Report;
  languages: LanguageStat[];
  totalFiles: number;
  totalBytes: number;
  largestFiles: Array<{ path: string; size: number }>;
  treePreview: string;
  manifests: string[];
  configFiles: string[];
  committedEnvFiles: string[];
  summaryStats: Record<string, number | string>;
}

const EXT_LANGUAGE: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", pyi: "Python",
  go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", kts: "Kotlin",
  rb: "Ruby", php: "PHP", c: "C", h: "C", cpp: "C++", cc: "C++", hpp: "C++",
  cs: "C#", swift: "Swift", dart: "Dart", scala: "Scala",
  html: "HTML", htm: "HTML", css: "CSS", scss: "SCSS", sass: "Sass", less: "Less",
  vue: "Vue", svelte: "Svelte", astro: "Astro",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML",
  md: "Markdown", mdx: "Markdown", txt: "Text",
  sh: "Shell", bash: "Shell", zsh: "Shell", sql: "SQL",
  png: "PNG", jpg: "JPEG", jpeg: "JPEG", gif: "GIF", svg: "SVG", ico: "ICO", webp: "WebP",
  pdf: "PDF", zip: "ZIP", woff: "Font", woff2: "Font", ttf: "Font", eot: "Font",
  env: "Env", lock: "Lockfile", csv: "CSV", ipynb: "Jupyter",
};

const CONFIG_PATTERNS = [
  "tsconfig.json", "jsconfig.json", "next.config", "vite.config", "tailwind.config",
  "webpack.config", "babel.config", ".eslintrc", "eslint.config", "prettier",
  "Dockerfile", "docker-compose", ".github/workflows", "Makefile", "Procfile",
  "vercel.json", "netlify.toml", "nginx", "jest.config", "vitest.config", "pytest",
  "pyproject.toml", "setup.py", "setup.cfg", ".gitlab-ci.yml", "webpack", "rollup",
];

const MANIFESTS = [
  "package.json", "requirements.txt", "pyproject.toml", "go.mod", "Cargo.toml",
  "pom.xml", "build.gradle", "Gemfile", "composer.json", "mix.exs",
];

let counter = 0;
function nid(): string {
  counter += 1;
  return `ra-${counter}`;
}

function languageOf(path: string): string {
  const base = path.toLowerCase();
  if (base.endsWith("package-lock.json") || base.endsWith("yarn.lock") || base.endsWith("pnpm-lock.yaml") || base.endsWith("poetry.lock") || base.endsWith("cargo.lock")) return "Lockfile";
  if (base.endsWith(".d.ts")) return "TypeScript";
  if (base.includes("__pycache__") || base.endsWith(".pyc")) return "Compiled";
  const ext = base.includes(".") ? base.split(".").pop()! : "";
  return EXT_LANGUAGE[ext] ?? (ext ? ext.toUpperCase() : "Unknown");
}

const CODE_LANGS = new Set([
  "TypeScript", "JavaScript", "Python", "Go", "Rust", "Java", "Kotlin", "Ruby",
  "PHP", "C", "C++", "C#", "Swift", "Dart", "Scala", "Vue", "Svelte", "Astro",
  "HTML", "CSS", "SCSS", "Sass", "Less", "Shell", "SQL",
]);

export function analyzeRepo(files: RepoFile[]): RepoAnalysis {
  counter = 0;
  const findings: Finding[] = [];
  const langBytes = new Map<string, number>();
  const langFiles = new Map<string, number>();
  let totalBytes = 0;
  let codeBytes = 0;
  const manifests: string[] = [];
  const configFiles: string[] = [];
  const committedEnvFiles: string[] = [];

  for (const f of files) {
    totalBytes += f.size;
    const lang = languageOf(f.path);
    langBytes.set(lang, (langBytes.get(lang) ?? 0) + f.size);
    langFiles.set(lang, (langFiles.get(lang) ?? 0) + 1);
    if (CODE_LANGS.has(lang)) codeBytes += f.size;

    const lower = f.path.toLowerCase();
    const base = lower.split("/").pop() ?? lower;

    if (MANIFESTS.includes(base)) manifests.push(f.path);
    if (CONFIG_PATTERNS.some((c) => lower.includes(c))) configFiles.push(f.path);
    if (base === ".env" || base === ".env.local" || base === ".env.production" || base === ".env.development") {
      committedEnvFiles.push(f.path);
      findings.push({
        id: nid(),
        severity: "high",
        title: `.env file committed: ${f.path}`,
        detail: "Environment files frequently contain live credentials. Remove it, rotate anything inside, add it to .gitignore, and ship a .env.example instead.",
        location: f.path,
      });
    }
    if (f.size > 1_000_000) {
      findings.push({
        id: nid(),
        severity: "medium",
        title: `Large file (${formatBytes(f.size)}): ${f.path}`,
        detail: "Files over 1 MB bloat clones and CI times. Move binaries/media to object storage or Git LFS.",
        location: f.path,
      });
    }
    if (/\.(min\.js|min\.css|bundle\.js)$/.test(lower) && !/node_modules|dist\/|build\/|\.next/.test(lower)) {
      findings.push({
        id: nid(),
        severity: "low",
        title: `Minified artifact committed: ${f.path}`,
        detail: "Minified bundles outside a build output directory suggest build artifacts are committed. Build in CI instead.",
        location: f.path,
      });
    }
    if (/node_modules\/|__pycache__|\.class$|\.o$|\.pyc$|vendor\//.test(lower)) {
      findings.push({
        id: nid(),
        severity: "medium",
        title: `Dependency/vendor artifact committed: ${f.path}`,
        detail: "Committed dependency directories (node_modules, vendor, caches) balloon repo size. They should be installed, not stored.",
        location: f.path,
      });
    }
  }

  if (!files.some((f) => (f.path.split("/").pop() ?? "").toLowerCase().startsWith("readme"))) {
    findings.push({
      id: nid(),
      severity: "medium",
      title: "No README found",
      detail: "Every project needs an entry point for humans: what it is, how to run it, how to contribute.",
    });
  }
  if (manifests.length === 0) {
    findings.push({
      id: nid(),
      severity: "low",
      title: "No dependency manifest found",
      detail: "No package.json / requirements.txt / go.mod / Cargo.toml / pom.xml detected. Dependencies are either vendored or the project is not in this archive.",
    });
  }

  const languages: LanguageStat[] = [...langBytes.entries()]
    .map(([language, bytes]) => ({
      language,
      bytes,
      files: langFiles.get(language) ?? 0,
      share: codeBytes > 0 && CODE_LANGS.has(language) ? Math.round((bytes / codeBytes) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const largestFiles = [...files].sort((a, b) => b.size - a.size).slice(0, 12).map((f) => ({ path: f.path, size: f.size }));

  // depth-2 tree preview
  const dirCount = new Map<string, number>();
  for (const f of files) {
    const parts = f.path.split("/");
    const dir = parts.slice(0, -1).slice(0, 2).join("/");
    dirCount.set(dir || "/", (dirCount.get(dir || "/") ?? 0) + 1);
  }
  const treePreview = [...dirCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([dir, count]) => `${dir.padEnd(40, " ")} ${String(count).padStart(4)} files`)
    .join("\n");

  const isMonorepo = files.some((f) => /^apps\/|^packages\//.test(f.path));
  if (isMonorepo) {
    findings.push({
      id: nid(),
      severity: "info",
      title: "Monorepo layout detected (apps/ or packages/)",
      detail: "Shared tooling and atomic cross-package changes become easy; adopt workspace tooling (npm/pnpm/turbo workspaces) if not already.",
    });
  }

  const score = Math.max(0, Math.min(100, 100 - findings.reduce((acc, f) => {
    const cost: Record<string, number> = { critical: 30, high: 15, medium: 8, low: 3, info: 0 };
    return acc + (cost[f.severity] ?? 0);
  }, 0)));

  const summary =
    `Analyzed ${files.length.toLocaleString()} files (${formatBytes(totalBytes)}). ` +
    `${languages.filter((l) => CODE_LANGS.has(l.language)).length} programming languages detected; ` +
    `${manifests.length} dependency manifest${manifests.length === 1 ? "" : "s"}; ${configFiles.length} config files. ` +
    (findings.length === 0 ? "No structural issues flagged." : `${findings.length} observation${findings.length === 1 ? "" : "s"} — see findings.`);

  const report: Report = {
    tool: "repo-analyzer",
    toolLabel: getTool("repo-analyzer").name,
    title: "ForgeKit Repo Analyzer Report",
    generatedAt: new Date().toISOString(),
    score,
    summary,
    findings,
    sections: [
      {
        heading: "Languages (by bytes)",
        rows: languages.slice(0, 15).map((l) => [
          l.language,
          `${formatBytes(l.bytes)} · ${l.files} file${l.files === 1 ? "" : "s"}${l.share > 0 ? ` · ${l.share}% of code` : ""}`,
        ]),
      },
      {
        heading: "Largest files",
        rows: largestFiles.slice(0, 10).map((f) => [f.path, formatBytes(f.size)]),
      },
      {
        heading: "Directory preview (top by file count)",
        code: treePreview || "(empty)",
      },
      {
        heading: "Build & dependency surfaces",
        rows: [
          ["Manifests", manifests.join(", ") || "none"],
          ["Config files", `${configFiles.length} found`],
          ["Monorepo", isMonorepo ? "yes" : "no"],
        ],
      },
    ],
    meta: { Files: String(files.length), "Total size": formatBytes(totalBytes) },
  };

  return {
    report,
    languages,
    totalFiles: files.length,
    totalBytes,
    largestFiles,
    treePreview,
    manifests,
    configFiles,
    committedEnvFiles,
    summaryStats: {
      files: files.length,
      bytes: totalBytes,
      languages: languages.filter((l) => CODE_LANGS.has(l.language)).length,
      manifests: manifests.length,
    },
  };
}
