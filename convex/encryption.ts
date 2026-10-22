import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";
import { internalQuery as rawInternalQuery } from "./_generated/server";
import { internalMutation } from "./functions";
import { ENCRYPTED_FIELDS, isEncrypted } from "./lib/encryption";

/*
 * Housekeeping for field encryption (lib/encryption.ts). After turning encryption on, or on a deployment
 * that has rows from before it:
 *
 *   pnpm exec convex run encryption:encryptExisting      # rewrites plaintext values encrypted
 *   pnpm exec convex run encryption:status               # how many values are still plaintext
 */

const TABLES = Object.keys(ENCRYPTED_FIELDS) as TableNames[];
const BATCH = 100;

/** Re-saves each row's sensitive fields, which the encrypting writer stores encrypted. Runs in batches. */
export const encryptExisting = internalMutation({
  args: { table: v.optional(v.string()), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<null> => {
    const table = (args.table ?? TABLES[0]) as TableNames;
    const fields = ENCRYPTED_FIELDS[table] ?? [];
    const page = await ctx.db.query(table).paginate({ numItems: BATCH, cursor: args.cursor ?? null });

    for (const doc of page.page) {
      // Reads come back decrypted; writing the same values back stores them encrypted (unchanged ones keep
      // their ciphertext, so already-encrypted rows aren't rewritten)
      const values = Object.fromEntries(fields.map((f) => [f, (doc as Record<string, unknown>)[f]]));
      await ctx.db.patch(table, doc._id as never, values as never);
    }

    const next = page.isDone ? TABLES[TABLES.indexOf(table) + 1] : table;
    if (next) {
      await ctx.scheduler.runAfter(0, internal.encryption.encryptExisting, {
        table: next,
        cursor: page.isDone ? null : page.continueCursor,
      });
    }
    return null;
  },
});

/** Counts encrypted and plaintext values per field, reading storage directly (not through decryption). */
export const status = rawInternalQuery({
  args: { paginationOpts: v.optional(paginationOptsValidator) },
  handler: async (ctx) => {
    const result: Record<string, { rows: number; encrypted: number; plaintext: number; empty: number }> = {};
    for (const table of TABLES) {
      const counts = { rows: 0, encrypted: 0, plaintext: 0, empty: 0 };
      for await (const doc of ctx.db.query(table)) {
        counts.rows++;
        for (const field of ENCRYPTED_FIELDS[table] ?? []) {
          const value = (doc as Record<string, unknown>)[field];
          if (value === undefined || value === "") counts.empty++;
          else if (isEncrypted(value)) counts.encrypted++;
          else counts.plaintext++;
        }
      }
      result[table] = counts;
    }
    return result;
  },
});
