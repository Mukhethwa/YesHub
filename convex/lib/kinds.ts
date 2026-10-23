// Shared by the browser and Convex, so only relative imports here.
import type { OpportunityKind } from "../schema";

/*
 * Two families of opportunity. Procurement is what an organisation wants to buy: its Listings, and SMEs'
 * My matches. Enterprise and supplier development (ESD) is what it offers SMEs to help them grow: its ESD
 * menu, and SMEs' Support programmes. An SME accepted into an ESD programme is told so; procurement
 * outcomes stay with the buyer.
 */

export const PROCUREMENT_KINDS = ["tender", "rfq"] as const satisfies readonly OpportunityKind[];
export const ESD_KINDS = ["grant", "funding", "accelerator", "support"] as const satisfies readonly OpportunityKind[];

export type EsdKind = (typeof ESD_KINDS)[number];

export const isEsd = (kind: OpportunityKind): kind is EsdKind => (ESD_KINDS as readonly string[]).includes(kind);
