import { Suspense } from "react";

import { EsdView } from "@/components/enterprise/esd-view";

export default function Page() {
  // EsdView reads ?id= to open one programme, which needs a Suspense boundary
  return (
    <Suspense>
      <EsdView kind="accelerator" />
    </Suspense>
  );
}
