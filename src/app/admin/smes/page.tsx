import { Suspense } from "react";

import { SmesTable } from "@/components/admin/smes-table";

export default function Page() {
  // SmesTable reads ?id= to open a record, which needs a Suspense boundary
  return (
    <Suspense>
      <SmesTable />
    </Suspense>
  );
}
