import { Suspense } from "react";

import { SuppliersView } from "@/components/enterprise/suppliers-view";

export default function Page() {
  // SuppliersView reads ?id= to open one supplier, which needs a Suspense boundary
  return (
    <Suspense>
      <SuppliersView />
    </Suspense>
  );
}
