"use client";

import { Surface } from "@webprodigies/flute";
import { Building2Icon } from "lucide-react";

import { OpportunityPreview } from "@/components/landing/previews";
import { Audience, BUYER_POINTS } from "@/components/landing/sections";
import { Centre, Lifted } from "../lifted";

export default function BuyersScene() {
  return (
    <Centre>
      <Surface id="buyers" style={{ width: 1400 }}>
        {/* The page background the section sits on */}
        <div className="rounded-xl bg-background px-14 py-16 text-foreground">
          <Lifted>
            <Audience
              id="for-buyers"
              icon={Building2Icon}
              tone="bg-brand-blue text-white"
              eyebrow="For enterprises and funders"
              title="A shortlist you can defend"
              points={BUYER_POINTS}
              cta="Set up your organisation"
              preview={<OpportunityPreview />}
              reverse
            />
          </Lifted>
        </div>
      </Surface>
    </Centre>
  );
}
