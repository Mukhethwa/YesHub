import { createAuth } from "../auth";

// A static instance for Better Auth schema generation only (`pnpm auth:generate`).
// Don't import this at runtime: it has no environment variables.
export const auth = createAuth({} as Parameters<typeof createAuth>[0]);
