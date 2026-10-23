/*
 * Jev, TypeSafe's System One model, through TypeSafe's own API. Jev doesn't write text: it answers typed
 * questions about a piece of content (`state`) with probabilities, so every judgement on the paper trail is
 * a yes/no probability, a choice with its confidence, or a level on a rubric we wrote. The reasons people
 * read are composed from those answers and the buyer's criteria (reviewActions.ts).
 *
 * Needs TYPESAFE_API_KEY on the Convex deployment. JEV_MODEL overrides the model (default jev-latest).
 */

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
/** TypeSafe bills input tokens only, at $42 per billion (docs.typesafe.ai/models). */
const USD_PER_INPUT_TOKEN = 42 / 1_000_000_000;
/** Above this, the request asks for the long-context limits (slower, so only when needed). */
const LONG_CONTEXT_CHARS = 100_000;

export type Question =
  | { type: "noul"; instructions?: string; criteria?: { true?: string; false?: string } }
  | { type: "choice"; instructions?: string; criteria: Record<string, string> }
  | { type: "score"; instructions?: string; criteria: string[] };

export type NoulAnswer = { type: "noul"; noul: number };
export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
export type ScoreAnswer = {
  type: "score";
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
};
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

/** The answers to one request, keyed like its questions, with what the paper trail records about the call. */
export type JevResult<Q extends Record<string, Question>> = {
  answers: {
    [K in keyof Q]: Q[K]["type"] extends "noul"
      ? NoulAnswer
      : Q[K]["type"] extends "choice"
        ? ChoiceAnswer
        : ScoreAnswer;
  };
  model: string;
  inputTokens: number;
  costUsd: number;
};

/** A failure worth retrying (rate limits, overload, outages, a malformed answer). */
export class JevError extends Error {}

export async function askJev<Q extends Record<string, Question>>({
  state,
  questions,
}: {
  /** What every question is about: the document, application or shortlist, as text or JSON. */
  state: string | Record<string, unknown>;
  questions: Q;
}): Promise<JevResult<Q>> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("TYPESAFE_API_KEY isn’t set on this Convex deployment.");

  const body = JSON.stringify({ model: process.env.JEV_MODEL || "jev-latest", state, questions });
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(body.length > LONG_CONTEXT_CHARS ? { "TypeSafe-Danger-Zone-Long-Context": "true" } : {}),
    },
    body,
  });

  const json = (await res.json().catch(() => null)) as {
    model?: string;
    answers?: Record<string, Answer>;
    usage?: { input_tokens?: number };
    error?: { message?: string } | string;
    message?: string;
  } | null;
  const message = typeof json?.error === "string" ? json.error : (json?.error?.message ?? json?.message ?? "");

  if (res.status === 401) throw new Error("The review service rejected MASLink’s API key (TypeSafe 401).");
  if (res.status === 402) {
    throw new JevError(
      "The review service is out of credits (TypeSafe). MASLink needs to add credits, then review again.",
    );
  }
  if (!res.ok || !json?.answers) {
    throw new JevError(`TypeSafe returned ${res.status}${message ? `: ${message}` : ""}`);
  }
  for (const [name, question] of Object.entries(questions)) {
    if (json.answers[name]?.type !== question.type)
      throw new JevError(`The review gave no ${question.type} answer for ${name}.`);
  }

  const inputTokens = json.usage?.input_tokens ?? 0;
  return {
    answers: json.answers as JevResult<Q>["answers"],
    model: json.model ?? "jev",
    inputTokens,
    costUsd: inputTokens * USD_PER_INPUT_TOKEN,
  };
}

/** A probability as a whole percentage, for reasons people read: 0.823 → "82%". */
export const percent = (p: number) => `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;

/** Trims long strings before they go to the database. */
export const clip = (text: string, max = 2000) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
