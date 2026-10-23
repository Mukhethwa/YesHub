"use client";

import { Surface } from "@webprodigies/flute";

import { FinalCta } from "@/components/landing/sections";
import { Logo } from "@/components/logo";
import { Centre, Lifted } from "../lifted";

export default function FinaleScene() {
  return (
    <Centre>
      <Surface id="stage" style={{ width: 1400 }}>
        <div className="flex flex-col items-center gap-14">
          <Surface id="logo" style={{ width: 420 }}>
            <div className="flex justify-center text-white">
              <Logo className="h-32" />
            </div>
          </Surface>
          <div className="w-full">
            <Lifted>
              <FinalCta />
            </Lifted>
          </div>
        </div>
      </Surface>
    </Centre>
  );
}
