"use client";

import { type CSSProperties, createContext, type ReactNode, useContext } from "react";

/*
 * Marks a piece of the landing page that the marketing video can move on its own (src/flute/scenes). On the
 * page it changes nothing: a Part renders its children, or a plain div when it carries layout classes.
 * Inside a scene, ScenePartsProvider turns each Part into a Flute Surface, so headlines, cards and rows can
 * fly in or lift out of the page without the UI being redrawn.
 */

export type PartWrap = (part: {
  id: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) => ReactNode;

const PartContext = createContext<PartWrap | null>(null);

export function ScenePartsProvider({ wrap, children }: { wrap: PartWrap; children: ReactNode }) {
  return <PartContext.Provider value={wrap}>{children}</PartContext.Provider>;
}

export function Part({
  id,
  className,
  style,
  children,
}: {
  /** Unique within a scene. */
  id: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const wrap = useContext(PartContext);
  if (wrap) return <>{wrap({ id, className, style, children })}</>;
  if (!className && !style) return <>{children}</>;
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

const ScenePathnameContext = createContext<string | null>(null);

/** Inside a video scene the URL is /flute; this tells the portal which page it's showing instead. */
export function ScenePathname({ value, children }: { value: string; children: ReactNode }) {
  return <ScenePathnameContext.Provider value={value}>{children}</ScenePathnameContext.Provider>;
}

/** The page a scene is showing, or null outside a scene. */
export function useScenePathname() {
  return useContext(ScenePathnameContext);
}
