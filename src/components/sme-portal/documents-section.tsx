"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRef, useState } from "react";

import { checkFile } from "@/components/sme/controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useUploadFile } from "@/hooks/use-upload-file";
import { errorMessage } from "@/lib/errors";
import { DOC_ACCEPT } from "@/lib/sme/constants";
import { DOCUMENTS, type DocStatus, type DocumentType, docStatus, expiryFor } from "@/lib/sme/documents";
import { formatBytes, formatDate } from "@/lib/sme/format";
import type { SmeProfile } from "@/lib/sme/types";
import { api } from "../../../convex/_generated/api";
import { DocumentProgress } from "./document-progress";
import { SectionHeader } from "./require-sme";

export function DocumentsSection({ sme }: { sme: SmeProfile }) {
  const urls = useQuery(api.smes.documentUrls) ?? {};

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Documents"
        description="Keep your tender pack complete and current. Buyers check these before they shortlist you."
      />

      <Card>
        <CardHeader>
          <CardTitle>Your document pack</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentProgress sme={sme} />
          <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
            Expiry dates for your B-BBEE certificate and tax clearance are set in{" "}
            <Link href="/sme/profile" className="font-medium text-foreground underline underline-offset-2">
              Business profile
            </Link>
            . We remind you before they lapse.
          </p>
        </CardContent>
      </Card>

      <DocGroup
        title="Required for most tenders"
        description="Corporates and government buyers usually can’t contract without these."
        docs={DOCUMENTS.filter((d) => d.required)}
        sme={sme}
        urls={urls}
      />
      <DocGroup
        title="Recommended"
        description="These make you easier to approve as a new supplier."
        docs={DOCUMENTS.filter((d) => !d.required)}
        sme={sme}
        urls={urls}
      />
    </div>
  );
}

function DocGroup({
  title,
  description,
  docs,
  sme,
  urls,
}: {
  title: string;
  description: string;
  docs: DocumentType[];
  sme: SmeProfile;
  urls: Partial<Record<string, string>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {docs.map((doc) => (
            <DocRow key={doc.key} doc={doc} sme={sme} url={urls[doc.key]} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function DocRow({ doc, sme, url }: { doc: DocumentType; sme: SmeProfile; url?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadFile = useUploadFile();
  const setDocument = useMutation(api.smes.setDocument);
  const removeDocument = useMutation(api.smes.removeDocument);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const file = sme.documents[doc.key];
  const status = docStatus(sme, doc.key);
  const expiry = expiryFor(sme, doc.key);

  const run = async (kind: "upload" | "remove", task: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const upload = (picked: File | undefined) => {
    if (!picked) return;
    const issue = checkFile(picked);
    if (issue) return setError(issue);
    void run("upload", async () => setDocument({ key: doc.key, file: await uploadFile(picked) }));
  };

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium">{doc.label}</p>
          <StatusBadge status={status} />
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{doc.description}</p>
        {file && (
          <p className="mt-1.5 text-sm">
            <span className="break-all">{file.name}</span>
            <span className="text-muted-foreground">
              {" "}
              ({formatBytes(file.size)}), uploaded {formatDate(file.uploadedAt)}
              {expiry && `, ${status === "expired" ? "expired" : "expires"} ${formatDate(expiry)}`}
            </span>
          </p>
        )}
        {error && (
          <p role="alert" className="mt-1.5 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={DOC_ACCEPT}
          className="sr-only"
          aria-label={`Upload ${doc.label}`}
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {file && url && (
          <Button variant="ghost" size="sm" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              View
            </a>
          </Button>
        )}
        {file && !doc.required && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => run("remove", () => removeDocument({ key: doc.key }))}
          >
            {busy === "remove" ? "Removing…" : "Remove"}
          </Button>
        )}
        <Button
          size="sm"
          variant={file && status === "ok" ? "outline" : "default"}
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
        >
          {busy === "upload" && <Spinner />}
          {busy === "upload" ? "Uploading…" : file ? "Replace" : "Upload"}
        </Button>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: DocStatus }) {
  if (status === "ok") return <Badge variant="secondary">Uploaded</Badge>;
  if (status === "expired") return <Badge variant="destructive">Expired</Badge>;
  return <Badge variant="outline">Not uploaded</Badge>;
}
