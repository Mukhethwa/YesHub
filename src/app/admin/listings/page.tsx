import { Suspense } from "react";

import { ListingsTable } from "@/components/admin/listings-table";

export default function Page() {
  // ListingsTable reads ?id= to open a listing, which needs a Suspense boundary
  return (
    <Suspense>
      <ListingsTable />
    </Suspense>
  );
}
