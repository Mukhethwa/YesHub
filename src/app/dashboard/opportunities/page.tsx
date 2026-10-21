import { Suspense } from "react";

import { OpportunitiesView } from "@/components/enterprise/opportunities-view";

export default function Page() {
  // OpportunitiesView reads ?id= to open one opportunity, which needs a Suspense boundary
  return (
    <Suspense>
      <OpportunitiesView />
    </Suspense>
  );
}
