"use client";

import { MoreHorizontalIcon, PencilIcon, ScrollTextIcon, SendIcon } from "lucide-react";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { runMutation } from "@/components/admin/shared";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { OpportunityStatus } from "../../../convex/schema";

/*
 * What a buyer can do to an opportunity as a whole: edit or amend it, publish a draft, close it early or
 * cancel it. Closing and cancelling ask for a reason, which goes on the audit log and, for a cancellation,
 * to every applicant.
 */

type Pending = "close" | "cancel" | "delete" | null;

export function OpportunityActions({
  opportunityId,
  reference,
  status,
  canManage,
}: {
  opportunityId: Id<"opportunities">;
  reference: string;
  status: OpportunityStatus;
  /** Owners and admins: publishing, amending, closing and cancelling are theirs. */
  canManage: boolean;
}) {
  const router = useRouter();
  const publish = useMutation(api.opportunities.publish);
  const close = useMutation(api.opportunities.close);
  const cancel = useMutation(api.opportunities.cancel);
  const removeDraft = useMutation(api.opportunities.removeDraft);
  const [confirming, setConfirming] = useState<Pending>(null);
  const [publishing, setPublishing] = useState(false);
  const finished = status === "cancelled" || status === "awarded";
  const editable = !finished && (status === "draft" || canManage);

  const publishNow = async () => {
    setPublishing(true);
    await runMutation(`${reference} published. SMEs can now apply.`, () => publish({ opportunityId }));
    setPublishing(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && canManage && (
        <Button size="sm" onClick={publishNow} disabled={publishing}>
          {publishing ? <Spinner /> : <SendIcon />}
          Publish
        </Button>
      )}
      {editable && (
        <Button size="sm" variant="outline" asChild>
          <Link href={`/dashboard/opportunities/new?id=${opportunityId}`}>
            <PencilIcon /> {status === "draft" ? "Edit" : "Amend"}
          </Link>
        </Button>
      )}
      <Button size="sm" variant="outline" asChild>
        <Link href={`/dashboard/audit?opportunity=${opportunityId}`}>
          <ScrollTextIcon /> Audit log
        </Link>
      </Button>
      {!finished && (canManage || status === "draft") && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" aria-label="More actions">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {status === "open" && canManage && (
              <DropdownMenuItem onSelect={() => setConfirming("close")}>Close to new applications</DropdownMenuItem>
            )}
            {status === "draft" && (
              <DropdownMenuItem onSelect={() => setConfirming("delete")}>Delete draft</DropdownMenuItem>
            )}
            {canManage && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirming("cancel")}>
                  Cancel listing
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <ConfirmDialog
        open={confirming === "close"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Close ${reference} early?`}
        description="No new applications are accepted. Applicants who already applied keep their place and can still be shortlisted."
        confirmLabel="Close it"
        reason={{ label: "Reason, for the audit log", required: true }}
        onConfirm={(reason) => runMutation(`${reference} closed.`, () => close({ opportunityId, reason }))}
      />
      <ConfirmDialog
        open={confirming === "cancel"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Cancel ${reference}?`}
        description="It can’t be awarded afterwards. Every applicant sees that it was cancelled and your reason. This can’t be undone."
        confirmLabel="Cancel listing"
        destructive
        reason={{ label: "Reason, shown to applicants and on the audit log", required: true }}
        onConfirm={(reason) => runMutation(`${reference} cancelled.`, () => cancel({ opportunityId, reason }))}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Delete the draft ${reference}?`}
        description="Its documents are deleted with it. The reference isn’t reused, and the deletion stays on the audit log."
        confirmLabel="Delete draft"
        destructive
        onConfirm={async () => {
          if (await runMutation(`Draft ${reference} deleted.`, () => removeDraft({ opportunityId }))) {
            router.push("/dashboard/opportunities");
          }
        }}
      />
    </div>
  );
}
