import type { CriterionKind } from "../schema";
import { bbbeeLevelNumber } from "./evaluation";

/*
 * The arithmetic of South African preferential procurement, so price and B-BBEE points are calculated the
 * same way every time instead of judged by a model. Jev judges the rest (functionality, gates, grant
 * criteria) and decides; these numbers are part of the paper trail it decides from.
 */

export type Criterion = {
  criterion: string;
  kind: CriterionKind;
  /** Points available (price, B-BBEE) or the minimum to proceed (functionality). */
  points?: number;
};

/** Reads how each of a buyer's evaluation criteria applies, from how tender notices usually word them. */
export function classifyCriteria(criteria: string[]): Criterion[] {
  return criteria
    .map((c) => c.trim())
    .filter(Boolean)
    .map((criterion) => {
      const points = /(\d+(?:\.\d+)?)\s*points?/i.exec(criterion);
      const n = points ? Number(points[1]) : undefined;
      if (/\bprice\b|\bquot/i.test(criterion) && n !== undefined) return { criterion, kind: "price", points: n };
      if (/b-?bbee|bee status/i.test(criterion) && n !== undefined) return { criterion, kind: "bbbee", points: n };
      if (/functionality/i.test(criterion)) return { criterion, kind: "functionality", points: n };
      if (/\brequired\b|\bmust\b|\bcompulsory\b|\bmandatory\b/i.test(criterion)) return { criterion, kind: "gate" };
      return { criterion, kind: "assessed" };
    });
}

/** 80/20 (contracts up to R50m) or 90/10, from the price points the buyer set. */
function system(pricePoints: number) {
  return pricePoints >= 85 ? 90 : 80;
}

/** Preferential procurement B-BBEE points by level, for the 80/20 and 90/10 systems. */
const BBBEE_POINTS: Record<80 | 90, number[]> = {
  // Level 1 .. Level 8
  80: [20, 18, 14, 12, 8, 6, 4, 2],
  90: [10, 9, 6, 5, 4, 3, 2, 1],
};

/** B-BBEE points for a level ("Level 2"), scaled to the points the buyer set. Non-compliant scores 0. */
export function bbbeePoints(level: string, available: number, pricePointsAvailable?: number) {
  const n = bbbeeLevelNumber(level);
  if (n === null) return 0;
  const table = BBBEE_POINTS[system(pricePointsAvailable ?? 100 - available)];
  const max = table[0];
  return Math.round((table[n - 1] / max) * available * 100) / 100;
}

/**
 * Price points: Ps = P × (1 − (Pt − Pmin) / Pmin), where Pmin is the lowest acceptable quote. Never below 0.
 */
export function pricePoints(quote: number, lowest: number, available: number) {
  if (lowest <= 0) return 0;
  const points = available * (1 - (quote - lowest) / lowest);
  return Math.max(0, Math.round(points * 100) / 100);
}

/** Rand, for the paper trail. */
export function rand(amount: number) {
  return `R${Math.round(amount).toLocaleString("en-ZA")}`;
}
