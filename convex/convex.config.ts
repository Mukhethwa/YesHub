import { defineApp } from "convex/server";
import betterAuth from "./betterAuth/convex.config";
import resend from "@convex-dev/resend/convex.config";
import workflow from "@convex-dev/workflow/convex.config.js";

const app = defineApp();
app.use(betterAuth);
app.use(resend);
// Durable workflows for Jev's application reviews and decisions (convex/review.ts)
app.use(workflow);

export default app;
