import { v } from "convex/values";

import { components } from "./_generated/api";
import { internalMutation } from "./functions";
import { ENCRYPTED_FIELDS } from "./lib/encryption";

/*
 * The product was renamed from YES Hub to MASLink. Text written before the rename (evaluation checks, the
 * review trail, sample submission instructions, the staff organisation's name) still says the old name;
 * this rewrites it. Safe to run more than once:
 *
 *   pnpm exec convex run rename:renameProduct
 *   pnpm exec convex run rename:renameProduct --prod
 */

const FROM = /YES Hub/g;
const TO = "MASLink";

const TABLES = [
  "applications",
  "reviewTrail",
  "decisionRuns",
  "opportunities",
  "organizationSettings",
  "documentExtractions",
] as const;

/** The value with every string in it renamed. */
function rename(value: unknown): unknown {
  if (typeof value === "string") return value.replace(FROM, TO);
  if (Array.isArray(value)) return value.map(rename);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rename(v)]));
  }
  return value;
}

export const renameProduct = internalMutation({
  args: {},
  returns: v.object({ documents: v.number(), staffOrganisation: v.boolean() }),
  handler: async (ctx) => {
    let documents = 0;
    for (const table of TABLES) {
      const skip = new Set<string>(ENCRYPTED_FIELDS[table as keyof typeof ENCRYPTED_FIELDS] ?? []);
      for await (const doc of ctx.db.query(table)) {
        const patch: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(doc)) {
          if (field.startsWith("_") || skip.has(field)) continue;
          const next = rename(value);
          if (JSON.stringify(next) !== JSON.stringify(value)) patch[field] = next;
        }
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(table, doc._id as never, patch as never);
          documents++;
        }
      }
    }
    const staffOrganisation = await ctx.runMutation(components.betterAuth.organizations.renameStaffOrganization, {
      from: "YES Hub",
      to: TO,
    });
    return { documents, staffOrganisation };
  },
});
