"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type AnalyticsScope, PlatformAnalytics } from "./analytics";
import { Insights } from "./insights";

/**
 * Analytics and Insights, one page with a tab each, for MASLink staff (the whole platform) or an enterprise
 * (its own listings and applicants). ?view=insights opens Insights.
 */
export function AnalyticsTabs({ scope = "platform" }: { scope?: AnalyticsScope }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view = params.get("view") === "insights" ? "insights" : "analytics";

  return (
    <Tabs
      value={view}
      onValueChange={(next) => router.replace(next === "insights" ? `${pathname}?view=insights` : pathname)}
      className="gap-6"
    >
      <TabsList>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="insights">Insights</TabsTrigger>
      </TabsList>
      <TabsContent value="analytics">
        <PlatformAnalytics scope={scope} />
      </TabsContent>
      <TabsContent value="insights">
        <Insights scope={scope} />
      </TabsContent>
    </Tabs>
  );
}
