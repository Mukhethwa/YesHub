"use client";

import { Surface } from "@webprodigies/flute";

import { Centre } from "../lifted";

import { SectionHeading, Step, STEPS } from "@/components/landing/sections";

export default function StepsScene() {
  return (
    <Centre>
      <Surface id="board" style={{ width: 1400 }}>
        <div className="space-y-10">
          <Surface id="heading" style={{ width: 900 }}>
            <div className="rounded-lg bg-background px-10 py-8 text-foreground">
              <SectionHeading eyebrow="How it works" title="From posting to award, in four steps" />
            </div>
          </Surface>
          <div className="grid grid-cols-4 gap-6">
            {STEPS.map((step, i) => (
              <Surface key={step.title} id={`step-${i}`}>
                {/* Each step on the muted band it sits on in the page */}
                <div className="h-64 rounded-lg border bg-muted p-7 text-foreground">
                  <Step step={step} number={i + 1} />
                </div>
              </Surface>
            ))}
          </div>
        </div>
      </Surface>
    </Centre>
  );
}
