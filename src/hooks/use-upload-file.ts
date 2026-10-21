"use client";

import { useMutation } from "convex/react";
import { useCallback } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** Uploads a file to Convex storage and returns what the smes mutations expect. */
export function useUploadFile() {
  const generateUploadUrl = useMutation(api.smes.generateUploadUrl);

  return useCallback(
    async (file: File) => {
      const url = await generateUploadUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!res.ok) throw new Error(`Couldn’t upload ${file.name}. Check your connection and try again.`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      return { storageId, name: file.name };
    },
    [generateUploadUrl],
  );
}
