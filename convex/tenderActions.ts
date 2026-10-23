"use node";

import { v } from "convex/values";
import { extractText, getDocumentProxy } from "unpdf";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { type Answer, askJev, type ChoiceAnswer, type NoulAnswer, percent, type Question } from "./lib/jev";
import {
  groupRequirements,
  SEGMENT_KINDS,
  type SegmentKind,
  segmentTender,
  TENDER_CHECKS,
  type TenderSegment,
} from "./lib/tender";

/*
 * Reads a buyer's tender PDF into a draft requirements register (see tenders.ts). Jev classifies every
 * statement in the tender as a mandatory requirement, a scored criterion, a returnable document, a
 * condition or background (one choice question each), and answers whether the tender states what a
 * complete tender should. Grouping the statements into requirements is plain code (lib/tender.ts).
 */

/** Statements classified per request. A long tender has 150 to 300. */
const SEGMENTS_PER_CALL = 160;
/** Most tender text sent with one request. */
const MAX_STATE_CHARS = 90_000;

export const readTender = internalAction({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args): Promise<null> => {
    const input = await ctx.runQuery(internal.tenders.readInput, args);
    if (!input) return null;
    const fail = (error: string) => ctx.runMutation(internal.tenders.readingFailed, { ...args, error });

    let pages: string[];
    try {
      const blob = await ctx.storage.get(input.storageId);
      if (!blob) {
        await fail("The tender document is missing from storage.");
        return null;
      }
      const pdf = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));
      const { text } = await extractText(pdf, { mergePages: false });
      pages = (Array.isArray(text) ? text : [text]).map((p) => p.replace(/[ \t]+\n/g, "\n"));
    } catch {
      await fail("The PDF couldn’t be opened. It may be damaged or password-protected.");
      return null;
    }
    const segments = segmentTender(pages);
    if (segments.length < 5) {
      await fail("Too little text could be read. The PDF may be a scan without a text layer.");
      return null;
    }

    try {
      // Each batch carries the pages its statements come from, so Jev reads them in context
      const batches: TenderSegment[][] = [];
      for (let i = 0; i < segments.length; i += SEGMENTS_PER_CALL)
        batches.push(segments.slice(i, i + SEGMENTS_PER_CALL));
      const kinds: { kind: SegmentKind; confidence: number }[] = [];
      const checks: Record<string, number> = {};
      let model = "jev";
      let costUsd = 0;

      for (const [b, batch] of batches.entries()) {
        const first = batch[0].page;
        const last = batch[batch.length - 1].page;
        const questions: Record<string, Question> = Object.fromEntries(
          batch.map((s, i) => [
            `s${i}`,
            {
              type: "choice",
              instructions: `What is this part of the tender: “${s.text.slice(0, 600)}”?`,
              criteria: SEGMENT_KINDS,
            } satisfies Question,
          ]),
        );
        // The completeness checks need the whole tender, so they go with the first batch
        if (b === 0)
          for (const [name, check] of Object.entries(TENDER_CHECKS))
            questions[`check_${name}`] = { type: "noul", instructions: check.question };
        const state = (b === 0 ? pages : pages.slice(first - 1, last)).join("\n").slice(0, MAX_STATE_CHARS);
        const result = await askJev({ state, questions });
        batch.forEach((_, i) => {
          const answer = (result.answers as Record<string, Answer>)[`s${i}`] as ChoiceAnswer;
          kinds.push({ kind: answer.choice as SegmentKind, confidence: answer.confidence });
        });
        for (const name of Object.keys(TENDER_CHECKS)) {
          const answer = (result.answers as Record<string, Answer>)[`check_${name}`] as NoulAnswer | undefined;
          if (answer) checks[name] = answer.noul;
        }
        model = result.model;
        costUsd += result.costUsd;
      }

      const { requirements, threshold } = groupRequirements(segments, kinds);
      const gaps = Object.entries(TENDER_CHECKS).flatMap(([name, check]) =>
        checks[name] !== undefined && checks[name] < 0.5
          ? [`${check.gap} (${percent(checks[name])} that it does)`]
          : [],
      );
      await ctx.runMutation(internal.tenders.saveReading, {
        ...args,
        // Confidence was only for grouping; the buyer checks the list
        requirements: requirements.map((r) => ({ ...r, confidence: undefined })),
        threshold,
        gaps,
        model,
        costUsd,
      });
    } catch (error) {
      // The buyer sees a plain message; the cause goes to the logs
      console.error("Reading the tender failed", error);
      await fail("The tender couldn’t be read right now. Try again in a few minutes.");
    }
    return null;
  },
});
