import React from "react";
import { notFound } from "next/navigation";
import FluteStudio from "../../../src/flute/Studio";
export default function FlutePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <><meta name="flute-project" content="2a32a6be-5d9e-4f9b-8ff6-6053635fc009" /><FluteStudio /></>;
}
