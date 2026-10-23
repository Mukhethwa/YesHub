import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { changeRow } from "./audit";
import { getEnterprise, organizationDetail } from "./enterprise";
import { query } from "./functions";

/*
 * The enterprise audit log: the same command log staff see in the admin area (convex/functions.ts records
 * every mutation and each document's state before and after), limited to the organisation's own data:
 * its opportunities, released documents, applications, document readings, shortlisting runs and settings.
 * Every member can read it; nothing can change it.
 *
 * Applicants appear by company, never by the person's name, because SMEs only share contact details once
 * they're shortlisted.
 */

type Enterprise = NonNullable<Awaited<ReturnType<typeof getEnterprise>>>;

/** Who ran each command, as this organisation may see them. */
async function actorNames(ctx: QueryCtx, enterprise: Enterprise, commands: Doc<"commands">[]) {
  const detail = await organizationDetail(ctx, enterprise.organization.id);
  const members = new Set(detail.members.map((m) => m.userId));
  const ids = [...new Set(commands.flatMap((c) => (c.actorId && members.has(c.actorId) ? [c.actorId] : [])))];
  const users = ids.length ? await ctx.runQuery(components.betterAuth.users.usersById, { ids }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));

  // Anyone else who changed the organisation's data is an applicant (or MASLink staff); name the business
  const outsiders = [...new Set(commands.flatMap((c) => (c.actorId && !members.has(c.actorId) ? [c.actorId] : [])))];
  const companies = new Map<string, string>();
  for (const userId of outsiders) {
    const sme = await ctx.db
      .query("smes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    companies.set(userId, sme ? `${sme.companyName} (applicant)` : "MASLink");
  }

  return (c: Doc<"commands">) =>
    !c.actorId
      ? "Automated"
      : members.has(c.actorId)
        ? (names.get(c.actorId) ?? c.actorName ?? "Former member")
        : (companies.get(c.actorId) ?? "Someone outside the organisation");
}

function commandRow(c: Doc<"commands">, actor: string) {
  return {
    id: c._id,
    at: c._creationTime,
    name: c.name,
    visibility: c.visibility,
    actor,
    actorId: c.actorId ?? null,
    changeCount: c.changeCount,
    tables: c.tables,
    reason: c.reason ?? null,
  };
}

/** The organisation's commands, newest first, a page at a time. */
export const commands = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) return { page: [], isDone: true, continueCursor: "" };
    const page = await ctx.db
      .query("commands")
      .withIndex("by_organization", (q) => q.eq("organizationId", enterprise.organization.id))
      .order("desc")
      .paginate(args.paginationOpts);
    const actorOf = await actorNames(ctx, enterprise, page.page);
    return { ...page, page: page.page.map((c) => commandRow(c, actorOf(c))) };
  },
});

/** Everything one command changed in the organisation's data. */
export const commandChanges = query({
  args: { commandId: v.id("commands") },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    const command = await ctx.db.get("commands", args.commandId);
    if (!enterprise || command?.organizationId !== enterprise.organization.id) return null;
    const changes = await ctx.db
      .query("changes")
      .withIndex("by_command", (q) => q.eq("commandId", args.commandId))
      .take(200);
    return Promise.all(changes.filter((c) => c.organizationId === enterprise.organization.id).map(changeRow));
  },
});

/** One record's history: every change to it, newest first. */
export const documentHistory = query({
  args: { table: v.string(), documentId: v.string() },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) return null;
    const changes = await ctx.db
      .query("changes")
      .withIndex("by_document", (q) => q.eq("table", args.table).eq("documentId", args.documentId))
      .order("desc")
      .take(100);
    const ours = changes.filter((c) => c.organizationId === enterprise.organization.id);
    return Promise.all(
      ours.map(async (change) => {
        const command = await ctx.db.get("commands", change.commandId);
        return {
          ...(await changeRow(change)),
          command: command?.name ?? null,
          reason: command?.reason ?? null,
          at: change._creationTime,
        };
      }),
    );
  },
});

/** Every command that touched one opportunity or anything belonging to it, newest first. */
export const opportunityCommands = query({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) return null;
    const changes = await ctx.db
      .query("changes")
      .withIndex("by_opportunity", (q) => q.eq("opportunityId", args.opportunityId))
      .order("desc")
      .take(500);
    const ids = [
      ...new Set(changes.filter((c) => c.organizationId === enterprise.organization.id).map((c) => c.commandId)),
    ];
    const commands = (await Promise.all(ids.map((id) => ctx.db.get("commands", id)))).filter(
      (c): c is Doc<"commands"> => c !== null,
    );
    const actorOf = await actorNames(ctx, enterprise, commands);
    return commands.map((c) => commandRow(c, actorOf(c)));
  },
});
