/*
 * Jev, TypeSafe's router model on OpenRouter: it picks a model and reasoning effort per request. Every call
 * returns what the paper trail needs (the model it chose, OpenRouter's generation id and the cost) with the
 * parsed JSON answer.
 *
 * Needs OPENROUTER_API_KEY on the Convex deployment. JEV_MODEL overrides the model (default
 * typesafe/jev-router).
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

type Content = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

export type JevResult<T> = {
  answer: T;
  model: string;
  generationId?: string;
  costUsd?: number;
};

/** A failure worth retrying (rate limits, provider outages, an answer that wasn't JSON). */
export class JevError extends Error {}

/** The first JSON object in a reply, tolerating code fences and text around it. */
export function parseJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new JevError("Jev’s answer wasn’t JSON.");
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new JevError("Jev’s answer wasn’t valid JSON.");
  }
}

export async function askJev<T>({
  system,
  user,
  maxTokens,
  parse,
}: {
  system: string;
  user: Content;
  maxTokens: number;
  /** Checks the shape of the answer and returns it typed; throw to have the step retried. */
  parse: (value: unknown) => T;
}): Promise<JevResult<T>> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY isn’t set on this Convex deployment.");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.SITE_URL ?? "https://yeshub-app.vercel.app",
      "X-Title": "YES Hub",
    },
    body: JSON.stringify({
      model: process.env.JEV_MODEL || "typesafe/jev-router",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // Router models may reason before answering; reasoning tokens count towards this
      max_tokens: maxTokens,
      temperature: 0,
      usage: { include: true },
    }),
  });

  const body = (await res.json().catch(() => null)) as {
    id?: string;
    model?: string;
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
    usage?: { cost?: number };
    error?: { message?: string };
  } | null;

  if (res.status === 402) {
    throw new JevError(
      "The OpenRouter account Jev uses is out of credits. Add credits at openrouter.ai/settings/credits, then review again.",
    );
  }
  if (!res.ok || !body) {
    throw new JevError(`OpenRouter returned ${res.status}${body?.error?.message ? `: ${body.error.message}` : ""}`);
  }
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new JevError(`Jev returned no answer (${body.choices?.[0]?.finish_reason ?? "no choices"}).`);
  }

  return {
    answer: parse(parseJsonObject(content)),
    model: body.model ?? "unknown",
    generationId: body.id,
    costUsd: body.usage?.cost,
  };
}

/* Small validators for Jev's answers. They coerce where it's safe and throw where it isn't. */

export function asObject(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new JevError(`Expected ${what} to be an object.`);
  return value as Record<string, unknown>;
}

export function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export function asStrings(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => asString(v)).filter(Boolean).slice(0, limit);
}

export function asScore(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "yes") return true;
  if (value === "false" || value === "no") return false;
  return undefined;
}

/** Trims long strings before they go to the database. */
export const clip = (text: string, max = 2000) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
