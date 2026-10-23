"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

/** "Capitec Bank" → "capitec-bank-4f2a"; the suffix keeps two organisations with the same name apart. */
function slugFor(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "organisation"}-${Math.random().toString(36).slice(2, 6)}`;
}

/** First step for enterprises and funders: every opportunity belongs to an organisation. */
export function CreateOrganisation() {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) return toast.error("Enter your organisation’s name.");

    setPending(true);
    const { data, error } = await authClient.organization.create({ name: trimmed, slug: slugFor(trimmed) });
    if (error || !data) {
      toast.error(error?.message || "Couldn’t create the organisation. Please try again.");
      setPending(false);
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    toast.success(`${trimmed} is set up. MASLink will verify it shortly.`);
    // The account query picks up the new membership and shows the dashboard
  };

  return (
    <Card className="mx-auto mt-12 max-w-lg">
      <CardHeader>
        <CardTitle>Set up your organisation</CardTitle>
        <CardDescription>
          Enterprises and funders use MASLink as an organisation, so your team can list tenders, RFQs and grants and
          review applicants together. MASLink verifies new organisations before they can publish.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="organisation-name">Organisation name</Label>
            <Input
              id="organisation-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Capitec Bank"
              autoComplete="organization"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending && <Spinner />}
            Create organisation
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
