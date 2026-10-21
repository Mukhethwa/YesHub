import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Plugins must match the server ones in convex/auth.ts
export const authClient = createAuthClient({
  plugins: [organizationClient({ teams: { enabled: true } }), adminClient(), convexClient()],
});
