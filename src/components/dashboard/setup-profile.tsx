"use client";

import { useMutation } from "convex/react";
import { Building2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api } from "../../../convex/_generated/api";

const isDev = process.env.NODE_ENV === "development";

/** Empty state for users who haven't registered a business yet. */
export function SetupProfile() {
  return (
    <Card className="mx-auto mt-12 max-w-lg text-center">
      <CardHeader className="items-center">
        <Building2Icon className="mx-auto mb-2 size-8 text-muted-foreground" />
        <CardTitle>Set up your business profile</CardTitle>
        <CardDescription>
          Tell us about your company, services and compliance documents so we can match you to tenders, RFQs and
          funding.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        {/* Registration hasn't been migrated from YesHub yet */}
        <Button disabled>Register your business (coming soon)</Button>
        {isDev && <SeedDemoButton />}
      </CardContent>
    </Card>
  );
}

function SeedDemoButton() {
  const seed = useMutation(api.smes.seedDemo);
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await seed();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Couldn’t create the sample profile.");
        } finally {
          setPending(false);
        }
      }}
    >
      {pending && <Spinner />}
      Dev: fill in a sample business
    </Button>
  );
}

/** Dev-only control to go back to the empty state. */
export function ClearDemoButton() {
  const clear = useMutation(api.smes.clearDemo);
  if (!isDev) return null;

  return (
    <div className="mx-auto max-w-6xl pt-2 text-right">
      <Button variant="link" size="sm" className="text-muted-foreground" onClick={() => clear()}>
        Dev: remove sample business
      </Button>
    </div>
  );
}
