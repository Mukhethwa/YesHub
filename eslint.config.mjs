import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "convex/**/_generated/**",
    // Local video exports and their helpers (gitignored)
    "renders/**",
  ]),
  {
    // Convex functions must come from convex/functions.ts, which logs every change and encrypts sensitive
    // fields. Importing the raw builders would skip both. (The local Better Auth component has its own.)
    files: ["convex/**/*.ts"],
    ignores: ["convex/functions.ts", "convex/encryption.ts", "convex/betterAuth/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        ...["./_generated/server", "../_generated/server"].map((name) => ({
          name,
          importNames: ["query", "mutation", "internalQuery", "internalMutation"],
          message: "Import query and mutation builders from convex/functions.ts (change log and encryption).",
        })),
      ].flat(),
    },
  },
  {
    // Vendored from the better-auth-ui shadcn registry. These components read
    // sessionStorage after hydration, which the React Compiler rules flag.
    files: ["src/components/auth/**"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);

export default eslintConfig;
