"use client";

import { Surface } from "@webprodigies/flute";

import { Fairness } from "@/components/landing/sections";
import { Centre, Lifted } from "../lifted";

export default function FairnessScene() {
  return (
    <Centre>
      <Surface id="fairness" style={{ width: 1400 }}>
        <Lifted>
          <Fairness />
        </Lifted>
      </Surface>
    </Centre>
  );
}
