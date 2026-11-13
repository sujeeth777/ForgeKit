"use client";

import { useState } from "react";
import { diagnoseEnv, type EnvStack, type EnvDiagnosis } from "@/engines/env-doctor";
import { ReportView } from "@/components/report-view";
import { Button, Card, EmptyState, Select, Spinner, TextArea, ToolHeader, Badge } from "@/components/ui";
import { recordRun } from "@/lib/runs";

const SAMPLE = `# paste your .env here (values are masked in all output)
NODE_ENV=production
PORT=3000
DATABASE_URL=
API_KEY=changeme
JWT_SECRET=secret
API_KEY=sk-live-abc123def456
DEBUG=true
`;

export default function EnvDoctorPage() {
  const [content, setContent] = useState("");
  const [stack, setStack] = useState<EnvStack>("generic");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EnvDiagnosis | null>(null);

  const run = () => {
    if (!content.trim()) return;
    setRunning(true);
    const startedAt = new Date().toISOString();
    setTimeout(() => {
      const out = diagnoseEnv(content, stack);
      setResult(out);
      setRunning(false);
      recordRun("env-doctor", `${out.vars.length} vars · ${stack}`, out.report, startedAt);
    }, 30);
  };

  return (
    <div>
      <ToolHeader
        icon="🩺"
        name="EnvDoctor"
        tagline="Health-check .env files: duplicates, empty values, placeholders that never got replaced, weak secrets. Values are masked instantly."
        privacy="LOCAL · VALUES MASKED"
      />

      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Select
            label="Project stack (baseline check)"
            value={stack}
            onChange={(v) => setStack(v as EnvStack)}
            options={[
              { value: "generic", label: "Generic" },
              { value: "node", label: "Node.js" },
              { value: "next", label: "Next.js" },
              { value: "python", label: "Python" },
              { value: "docker", label: "Docker / Compose" },
            ]}
            className="w-60"
          />
          <Button
            variant="ghost"
            onClick={() => setContent(SAMPLE)}
            className="ml-auto"
          >
            LOAD SAMPLE
          </Button>
        </div>
        <TextArea
          value={content}
          onChange={setContent}
          rows={12}
          label=".env content"
          placeholder={SAMPLE}
        />
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={run} disabled={running || !content.trim()}>
            ▶ DIAGNOSE
          </Button>
          <span className="font-mono text-[11px] text-faint">
            analyzed in your browser — never uploaded
          </span>
        </div>
        {running && <div className="mt-4"><Spinner /></div>}
      </Card>

      {result ? (
        <>
          {result.stats.duplicates > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              <Badge tone="amber">{result.stats.duplicates} duplicate keys</Badge>
              <Badge tone="red">{result.stats.empty} empty</Badge>
              <Badge tone="red">{result.stats.placeholders} placeholders</Badge>
              <Badge tone="red">{result.stats.weak} weak secrets</Badge>
            </div>
          )}
          <ReportView report={result.report} />
        </>
      ) : (
        <EmptyState
          icon="🩺"
          text="Paste a .env file and run the diagnosis. EnvDoctor checks for duplicates, empty values, leftover placeholders, weak secrets and missing baseline keys for your stack — values appear masked (ab████…) everywhere."
        />
      )}
    </div>
  );
}
