import { ConvexError } from "convex/values";

/** A message that's safe to show the user: ConvexError text as thrown, anything else generic. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  if (error instanceof ConvexError) return typeof error.data === "string" ? error.data : fallback;
  // Network and upload errors thrown in the browser are written for users
  if (error instanceof Error && !error.message.includes("[CONVEX")) return error.message;
  return fallback;
}
