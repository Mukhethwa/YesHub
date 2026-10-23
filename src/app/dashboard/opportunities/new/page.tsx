import { Suspense } from "react";

import { OpportunityFormPage } from "@/components/enterprise/opportunity-form";

export default function Page() {
  // The form reads ?id= to edit an existing opportunity, which needs a Suspense boundary
  return (
    <Suspense>
      <OpportunityFormPage />
    </Suspense>
  );
}
