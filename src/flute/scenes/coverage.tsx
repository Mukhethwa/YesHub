"use client";

import { Surface } from "@webprodigies/flute";
import { ConvexHttpClient } from "convex/browser";

import { Coverage } from "@/components/landing/sections";
import { api } from "../../../convex/_generated/api";
import { Centre, Lifted } from "../lifted";

// Load the live figures before the scene mounts, so the map and its figures exist from the first frame
const initial = await new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!).query(api.public.coverage, {});

export default function CoverageScene() {
  return (
    <Centre>
      <Surface id="coverage" style={{ width: 1400 }}>
        {/* The page background the section sits on */}
        <div className="rounded-xl bg-background text-foreground">
          <Lifted>
            <Coverage initial={initial} />
          </Lifted>
        </div>
      </Surface>
    </Centre>
  );
}
