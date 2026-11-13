import { describe, it, expect } from "vitest";
import {
  parseManifest, analyzeDeps, compareVersions, checkNpmOutdated,
} from "@/engines/dep-watch";
import { analyzeRepo } from "@/engines/repo-analyzer";
import { explainCommand, explainChmodMode } from "@/engines/linux-lens";

/* ---------- DepWatch ---------- */

describe("dep-watch versions", () => {
  it("compares semver correctly", () => {
    expect(compareVersions("1.2.3", "1.2.4")).toBeLessThan(0);
    expect(compareVersions("4.17.21", "4.17.20")).toBeGreaterThan(0);
    expect(compareVersions("^1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
  });
});

describe("dep-watch parsing", () => {
  it("parses package.json sections", () => {
    const deps = parseManifest(
      "package.json",
      JSON.stringify({
        dependencies: { express: "^4.18.0", lodash: "4.17.15" },
        devDependencies: { typescript: "^5.0.0" },
      }),
    );
    expect(deps).toHaveLength(3);
    expect(deps.find((d) => d.name === "lodash")?.section).toBe("dependencies");
    expect(deps.find((d) => d.name === "typescript")?.section).toBe("devDependencies");
  });

  it("parses requirements.txt", () => {
    const deps = parseManifest("requirements.txt", "requests==2.31.0\nflask>=2.0\n# comment\n");
    expect(deps).toHaveLength(2);
    expect(deps[0].version).toBe("2.31.0");
    expect(deps[0].ecosystem).toBe("pypi");
  });

  it("parses go.mod", () => {
    const deps = parseManifest("go.mod", "module app\n\ngo 1.22\n\nrequire (\n\tgithub.com/foo/bar v1.2.3\n)\n");
    expect(deps.some((d) => d.name === "github.com/foo/bar" && d.version === "v1.2.3")).toBe(true);
  });
});

describe("dep-watch analysis", () => {
  it("flags lodash 4.17.15 against the snapshot", () => {
    const { vulnerabilities, report } = analyzeDeps([
      { name: "lodash", version: "4.17.15", section: "dependencies", ecosystem: "npm" },
    ]);
    expect(vulnerabilities).toHaveLength(1);
    expect(vulnerabilities[0].advisory.fixed).toBe("4.17.21");
    expect(report.score).toBeLessThan(100);
  });

  it("clears patched lodash 4.17.21", () => {
    const { vulnerabilities } = analyzeDeps([
      { name: "lodash", version: "4.17.21", section: "dependencies", ecosystem: "npm" },
    ]);
    expect(vulnerabilities).toHaveLength(0);
  });

  it("flags vulnerable next.js ranges via base version extraction", () => {
    const { vulnerabilities } = analyzeDeps([
      { name: "next", version: "^14.1.0", section: "dependencies", ecosystem: "npm" },
    ]);
    expect(vulnerabilities.length).toBeGreaterThan(0);
  });

  it("reports npm outdated info when provided", () => {
    const { report } = analyzeDeps(
      [{ name: "express", version: "4.17.0", section: "dependencies", ecosystem: "npm" }],
      { outdated: { express: { current: "4.17.0", latest: "4.19.2" } }, npmCheckRan: true },
    );
    expect(report.findings.some((f) => f.title.includes("Outdated: express"))).toBe(true);
  });
});

/* ---------- Repo Analyzer ---------- */

describe("repo-analyzer", () => {
  const files = [
    { path: "src/index.ts", size: 3000 },
    { path: "src/app.tsx", size: 2000 },
    { path: "src/utils.py", size: 1000 },
    { path: ".env", size: 200 },
    { path: "assets/video.mp4", size: 3_000_000 },
    { path: "package.json", size: 500 },
    { path: "node_modules/react/index.js", size: 900 },
  ];

  it("computes language stats by bytes", () => {
    const { languages } = analyzeRepo(files);
    const ts = languages.find((l) => l.language === "TypeScript");
    expect(ts?.bytes).toBe(5000); // index.ts + app.tsx
    const js = languages.find((l) => l.language === "JavaScript");
    expect(js?.files).toBe(1);
  });

  it("flags committed .env", () => {
    const { report, committedEnvFiles } = analyzeRepo(files);
    expect(committedEnvFiles).toContain(".env");
    expect(report.findings.some((f) => f.title.includes(".env file committed"))).toBe(true);
  });

  it("flags large files and committed node_modules", () => {
    const { report } = analyzeRepo(files);
    expect(report.findings.some((f) => f.title.includes("Large file"))).toBe(true);
    expect(report.findings.some((f) => f.title.includes("node_modules"))).toBe(true);
  });

  it("flags a missing README", () => {
    const { report } = analyzeRepo(files);
    expect(report.findings.some((f) => f.title.includes("No README"))).toBe(true);
  });

  it("detects manifests and monorepos", () => {
    const withMonorepo = analyzeRepo([...files, { path: "apps/web/index.ts", size: 100 }, { path: "README.md", size: 50 }]);
    expect(withMonorepo.manifests).toContain("package.json");
    expect(withMonorepo.summaryStats.languages).toBeGreaterThan(0);
  });
});

/* ---------- LinuxLens ---------- */

describe("linux-lens", () => {
  it("explains numeric chmod modes", () => {
    const m = explainChmodMode("755");
    expect(m?.owner).toContain("read, write, execute");
    expect(m?.group).toContain("read, execute");
    expect(m?.others).toContain("read, execute");
    expect(m?.others).not.toContain("write");
  });

  it("explains 4-digit modes with special bits", () => {
    const m = explainChmodMode("4755");
    expect(m?.special).toContain("setuid");
  });

  it("explains symbolic modes", () => {
    const m = explainChmodMode("u+x");
    expect(m?.owner).toContain("add");
    expect(m?.owner).toContain("execute");
  });

  it("explains chmod command with examples", () => {
    const { match, report } = explainCommand("chmod 600 id_rsa");
    expect(match?.name).toBe("chmod");
    expect(report.sections.some((s) => s.heading === "Permission breakdown")).toBe(true);
  });

  it("warns on 777", () => {
    const { warning } = explainCommand("chmod 777 /etc/passwd");
    expect(warning).toContain("777");
  });

  it("warns on risky rm -rf", () => {
    const { warning } = explainCommand("rm -rf ~/important");
    expect(warning).toContain("unforgiving");
  });

  it("handles unknown commands gracefully", () => {
    const { match, report } = explainCommand("frobnicate --all");
    expect(match).toBeNull();
    expect(report.summary).toContain("not in the LinuxLens knowledge base");
  });

  it("categorizes commands", () => {
    const { match } = explainCommand("journalctl -u app -f");
    expect(match?.category).toBe("logs");
  });
});

describe("dep-watch npm check contract", () => {
  it("returns no failures for empty deps", async () => {
    const r = await checkNpmOutdated([]);
    expect(r.failed).toBe(false);
    expect(Object.keys(r.outdated)).toHaveLength(0);
  });
});
