import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { type Change, Triggers } from "convex-helpers/server/triggers";
import type { GenericDatabaseWriter } from "convex/server";

import type { DataModel, Id } from "./_generated/dataModel";
import {
  internalMutation as rawInternalMutation,
  internalQuery as rawInternalQuery,
  type MutationCtx,
  mutation as rawMutation,
  query as rawQuery,
} from "./_generated/server";
import { decryptingReader, encryptingWriter } from "./lib/encryption";

/*
 * The function builders every Convex module uses instead of ./_generated/server. They add two things:
 *
 *   The command log. Every mutation is a command: the first time it changes a document, a `commands` row
 *   records which function ran and who ran it, and every insert, update and delete it makes is a `changes`
 *   row with the document before and after and the fields that changed. Admin → Audit log shows them as
 *   diffs. (convex-helpers triggers, so no mutation has to remember to log.)
 *
 *   Encryption at rest. Sensitive fields (lib/encryption.ts) are encrypted as they're written and
 *   decrypted as they're read. The command log sits underneath, so its snapshots only hold ciphertext.
 *
 * Actions don't touch the database directly, so they keep the plain builders.
 */

/** Tables whose changes are logged. Append-only logs (the audit log, Jev's trail, activity) are records already. */
const LOGGED_TABLES = [
  "smes",
  "opportunities",
  "organizationSettings",
  "memberPreferences",
  "opportunityDocuments",
  "applications",
  "documentExtractions",
  "decisionRuns",
  // Not applicationDrafts: changes are listed per listing in the buyer's audit log, and an SME's unfinished
  // application must never reach the buyer
] as const;

type CommandState = {
  id: Id<"commands"> | null;
  tables: Set<string>;
  changes: number;
  /** The enterprise organisation whose data the command changed, for its audit log. */
  organizationId?: string;
  /** Why the person did it, when the mutation asks for a reason (noteReason). */
  reason?: string;
};
const COMMAND = Symbol("command");
type CommandCtx = MutationCtx & { [COMMAND]: CommandState };

/** A document without its system fields, which can't be stored inside another document. */
function snapshot(doc: Record<string, unknown> | null) {
  if (!doc) return undefined;
  return Object.fromEntries(Object.entries(doc).filter(([key]) => !key.startsWith("_")));
}

function changedFields(before?: Record<string, unknown>, after?: Record<string, unknown>) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])).sort();
}

async function recordChange(
  ctx: CommandCtx & { innerDb: GenericDatabaseWriter<DataModel> },
  table: string,
  change: Change<DataModel, (typeof LOGGED_TABLES)[number]>,
) {
  const state = ctx[COMMAND];
  const before = snapshot(change.oldDoc);
  const after = snapshot(change.newDoc);
  const fields = changedFields(before, after);
  if (change.operation === "update" && fields.length === 0) return;

  // Whose data this is: opportunities, applications, documents and settings carry their organisation
  const doc = after ?? before;
  const organizationId = typeof doc?.organizationId === "string" ? doc.organizationId : undefined;
  const opportunityId =
    table === "opportunities" ? change.id : typeof doc?.opportunityId === "string" ? doc.opportunityId : undefined;

  if (!state.id) {
    const [meta, identity] = await Promise.all([ctx.meta.getFunctionMetadata(), ctx.auth.getUserIdentity()]);
    state.id = await ctx.innerDb.insert("commands", {
      name: meta.name,
      visibility: meta.visibility,
      actorId: identity?.subject,
      actorName: identity?.name ?? identity?.email ?? undefined,
      changeCount: 0,
      tables: [],
      organizationId,
      reason: state.reason,
    });
    state.organizationId = organizationId;
  } else if (organizationId && !state.organizationId) {
    state.organizationId = organizationId;
    await ctx.innerDb.patch("commands", state.id, { organizationId });
  }
  state.changes++;
  state.tables.add(table);

  await ctx.innerDb.insert("changes", {
    commandId: state.id,
    table,
    documentId: change.id,
    operation: change.operation,
    organizationId,
    opportunityId,
    fields,
    before,
    after,
  });
  await ctx.innerDb.patch("commands", state.id, { changeCount: state.changes, tables: [...state.tables].sort() });
}

/**
 * Records why the person running this mutation did it, on the command, so the audit log shows the reason next
 * to the changes. Call it with the reason the person gave, before or after the writes.
 */
export async function noteReason(ctx: MutationCtx, reason: string) {
  const state = (ctx as CommandCtx)[COMMAND];
  if (!state) return;
  state.reason = reason;
  // commands isn't a logged table, so this write records nothing further
  if (state.id) await ctx.db.patch("commands", state.id, { reason });
}

const triggers = new Triggers<DataModel, CommandCtx>();
for (const table of LOGGED_TABLES) {
  triggers.register(table, (ctx, change) => recordChange(ctx, table, change));
}

/** ctx.db for mutations: encrypt and decrypt, then log the change. */
function writerFor(ctx: MutationCtx) {
  const commandCtx = Object.assign(ctx, { [COMMAND]: { id: null, tables: new Set(), changes: 0 } }) as CommandCtx;
  return { db: encryptingWriter(triggers.wrapDB(commandCtx).db) };
}

export const query = customQuery(
  rawQuery,
  customCtx((ctx) => ({ db: decryptingReader(ctx.db) })),
);
export const internalQuery = customQuery(
  rawInternalQuery,
  customCtx((ctx) => ({ db: decryptingReader(ctx.db) })),
);
export const mutation = customMutation(rawMutation, customCtx(writerFor));
export const internalMutation = customMutation(rawInternalMutation, customCtx(writerFor));
