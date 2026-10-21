import { Suspense } from "react";

import { OrganisationsTable } from "@/components/admin/organisations-table";

export default function Page() {
  // OrganisationsTable reads ?id= to open a record, which needs a Suspense boundary
  return (
    <Suspense>
      <OrganisationsTable />
    </Suspense>
  );
}
