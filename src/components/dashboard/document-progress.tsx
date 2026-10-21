import { Progress } from "@/components/ui/progress";
import { documentProgress } from "@/lib/sme/documents";
import type { SmeProfile } from "@/lib/sme/types";

export function DocumentProgress({ sme }: { sme: SmeProfile }) {
  const p = documentProgress(sme);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm">
          <span className="font-semibold">
            {p.done} of {p.total}
          </span>{" "}
          documents uploaded
        </p>
        <p className="text-2xl font-semibold tabular-nums">{p.percent}%</p>
      </div>
      <Progress value={p.percent} aria-label="Documents uploaded" />
      <p className="mt-2 text-[13px] text-muted-foreground">
        {p.requiredDone === p.requiredTotal
          ? "All required documents are in place."
          : `${p.requiredTotal - p.requiredDone} of ${p.requiredTotal} required documents still needed.`}
      </p>
    </div>
  );
}
