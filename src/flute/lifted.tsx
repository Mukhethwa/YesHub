"use client";

import { Surface } from "@webprodigies/flute";
import type { ReactNode } from "react";

import { type PartWrap, ScenePartsProvider, ScenePathname } from "@/components/scene-parts";

/**
 * Every Part inside becomes a Flute Surface with the same id, so the scene can move it on its own. Surface
 * wraps its children in its own element, so the Part's layout classes go on a div inside it.
 */
const wrap: PartWrap = ({ id, className, style, children }) => (
  <Surface id={id}>
    {className || style ? (
      <div className={className} style={style}>
        {children}
      </div>
    ) : (
      children
    )}
  </Surface>
);

export function Lifted({ children }: { children: ReactNode }) {
  return <ScenePartsProvider wrap={wrap}>{children}</ScenePartsProvider>;
}

/**
 * Centres a scene's root surface in the stage; surfaces otherwise sit in normal flow from the top. It has no
 * paint of its own and keeps the 3D context, so the camera still sees one continuous space.
 */
export function Centre({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transformStyle: "preserve-3d",
      }}
    >
      {children}
    </div>
  );
}

/**
 * A portal screen as one surface: the real shell (sidebar, top bar) around a real page, at a fixed size
 * instead of the browser window. `pathname` is the page it's showing, for the sidebar and breadcrumbs.
 */
export function AppFrame({
  pathname,
  height = 1000,
  children,
}: {
  pathname: string;
  height?: number;
  children: ReactNode;
}) {
  return (
    <Centre>
      <Surface id="app" style={{ width: 1600, height }}>
        <div className="h-full overflow-visible rounded-xl bg-background text-foreground">
          <ScenePathname value={pathname}>
            <Lifted>{children}</Lifted>
          </ScenePathname>
        </div>
      </Surface>
    </Centre>
  );
}
