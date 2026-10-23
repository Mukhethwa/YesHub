/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as admin from "../admin.js";
import type * as analytics from "../analytics.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as email from "../email.js";
import type * as encryption from "../encryption.js";
import type * as enterprise from "../enterprise.js";
import type * as functions from "../functions.js";
import type * as http from "../http.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_encryption from "../lib/encryption.js";
import type * as lib_evaluation from "../lib/evaluation.js";
import type * as lib_jev from "../lib/jev.js";
import type * as lib_opportunities from "../lib/opportunities.js";
import type * as lib_organizationSettings from "../lib/organizationSettings.js";
import type * as lib_procurement from "../lib/procurement.js";
import type * as lib_samplePdf from "../lib/samplePdf.js";
import type * as lib_staff from "../lib/staff.js";
import type * as lib_tender from "../lib/tender.js";
import type * as opportunities from "../opportunities.js";
import type * as organizationAudit from "../organizationAudit.js";
import type * as platform from "../platform.js";
import type * as public_ from "../public.js";
import type * as rename from "../rename.js";
import type * as review from "../review.js";
import type * as reviewActions from "../reviewActions.js";
import type * as seed from "../seed.js";
import type * as smeOpportunities from "../smeOpportunities.js";
import type * as smes from "../smes.js";
import type * as tenderActions from "../tenderActions.js";
import type * as tenders from "../tenders.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  admin: typeof admin;
  analytics: typeof analytics;
  audit: typeof audit;
  auth: typeof auth;
  email: typeof email;
  encryption: typeof encryption;
  enterprise: typeof enterprise;
  functions: typeof functions;
  http: typeof http;
  "lib/audit": typeof lib_audit;
  "lib/encryption": typeof lib_encryption;
  "lib/evaluation": typeof lib_evaluation;
  "lib/jev": typeof lib_jev;
  "lib/opportunities": typeof lib_opportunities;
  "lib/organizationSettings": typeof lib_organizationSettings;
  "lib/procurement": typeof lib_procurement;
  "lib/samplePdf": typeof lib_samplePdf;
  "lib/staff": typeof lib_staff;
  "lib/tender": typeof lib_tender;
  opportunities: typeof opportunities;
  organizationAudit: typeof organizationAudit;
  platform: typeof platform;
  public: typeof public_;
  rename: typeof rename;
  review: typeof review;
  reviewActions: typeof reviewActions;
  seed: typeof seed;
  smeOpportunities: typeof smeOpportunities;
  smes: typeof smes;
  tenderActions: typeof tenderActions;
  tenders: typeof tenders;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
