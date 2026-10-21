import { defineSchema } from "convex/server";

import { tables } from "./generatedSchema";

// Don't edit or add fields here: change Better Auth options in convex/auth.ts and regenerate
// generatedSchema.ts (`pnpm auth:generate`). Extra indexes can be added on top of `tables`.
const schema = defineSchema({
  ...tables,
});

export default schema;
