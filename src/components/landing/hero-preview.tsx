import { ClockIcon, MapPinIcon } from "lucide-react";

import { ScoreRing } from "@/components/sme-portal/score-ring";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

/** Illustrative snapshot of the SME dashboard. Decorative, so it's hidden from assistive tech. */
export function HeroPreview() {
  return (
    <div aria-hidden className="relative">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold">Ubuntu Facilities Services</p>
            <p className="text-xs text-muted-foreground">Cleaning & Facilities · Durban, KwaZulu-Natal</p>
          </div>
          <Badge variant="secondary">B-BBEE Level 1</Badge>
        </div>

        <div className="mt-5 flex items-center gap-5">
          <ScoreRing score={88} />
          <ul className="flex-1 space-y-2 text-sm">
            <li className="flex justify-between gap-2">
              <span>Valid B-BBEE certificate</span>
              <span className="text-xs text-success">Done</span>
            </li>
            <li className="flex justify-between gap-2">
              <span>Registered on the CSD</span>
              <span className="text-xs text-success">Done</span>
            </li>
            <li className="flex justify-between gap-2">
              <span>Tax compliance status</span>
              <span className="text-xs text-destructive">Renew</span>
            </li>
          </ul>
        </div>

        <div className="mt-5 border-t pt-4">
          <div className="mb-2 flex justify-between text-xs">
            <span className="text-muted-foreground">Tender pack</span>
            <span className="font-medium tabular-nums">6 of 8 documents</span>
          </div>
          <Progress value={75} />
        </div>
      </div>

      <div className="mt-3 ml-6 rounded-xl border bg-card p-4 shadow-sm sm:ml-16">
        <p className="text-xs font-medium text-muted-foreground">New match</p>
        <p className="mt-1.5 text-sm font-semibold">Office cleaning and hygiene services, 36 months</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPinIcon className="size-3.5" />
            eThekwini
          </span>
          <span className="inline-flex items-center gap-1">
            <ClockIcon className="size-3.5" />
            Closes in 12 days
          </span>
          <span className="font-medium text-foreground">94% fit</span>
        </div>
      </div>
    </div>
  );
}
