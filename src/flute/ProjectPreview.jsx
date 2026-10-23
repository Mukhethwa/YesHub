"use client";
import React from "react";
import { ProjectPreview } from "@webprodigies/flute/preview";
import { sceneModules } from "./catalog";
// Host-owned development flag: no process, Vite or Electron globals in this adapter.
export function FluteProjectPreview({ children, enabled, active, ...props }) {
  if (!enabled) return children;
  return <ProjectPreview {...props} projectId="2a32a6be-5d9e-4f9b-8ff6-6053635fc009" enabled={enabled} active={active} sceneModules={sceneModules}>{children}</ProjectPreview>;
}
