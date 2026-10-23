"use client";

import { Surface } from "@webprodigies/flute";

import { Hero } from "@/components/landing/sections";
import { Centre, Lifted } from "../lifted";

export default function HeroScene() {
  return (
    <Centre>
      <Surface id="hero" style={{ width: 1400 }}>
        <Lifted>
          <Hero />
        </Lifted>
      </Surface>
    </Centre>
  );
}
