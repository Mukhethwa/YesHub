"use client";

import { Surface } from "@webprodigies/flute";
import { StoreIcon } from "lucide-react";

import { SmePreview } from "@/components/landing/previews";
import { Audience, SME_POINTS } from "@/components/landing/sections";
import { Centre, Lifted } from "../lifted";

export default function SmesScene() {
  return (
    <Centre>
      <Surface id="smes" style={{ width: 1400 }}>
        {/* The page background the section sits on */}
        <div className="rounded-xl bg-background px-14 py-16 text-foreground">
          <Lifted>
            <Audience
              id="for-smes"
              icon={StoreIcon}
              tone="bg-brand-green text-brand-navy"
              eyebrow="For SMEs"
              title="Be ready before the tender closes"
              points={SME_POINTS}
              cta="Register your business"
              preview={<SmePreview />}
            />
          </Lifted>
        </div>
      </Surface>
    </Centre>
  );
}
