"use client";

import Link from "next/link";
import { createContext, Fragment, type ReactNode, useContext, useEffect, useState } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/*
 * shadcn's Breadcrumb draws the trail; this fills it in. The shell knows the area and the page (from the
 * nav), and a detail page adds the record it shows with useBreadcrumb.
 */

type Crumb = { label: string; href?: string };

const DetailContext = createContext<string | null>(null);
const SetDetailContext = createContext<(label: string | null) => void>(() => {});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [detail, setDetail] = useState<string | null>(null);
  return (
    <SetDetailContext.Provider value={setDetail}>
      <DetailContext.Provider value={detail}>{children}</DetailContext.Provider>
    </SetDetailContext.Provider>
  );
}

/** Adds the record a page shows to the breadcrumbs, e.g. useBreadcrumb(opportunity?.title). */
export function useBreadcrumb(label: string | null | undefined) {
  const set = useContext(SetDetailContext);
  useEffect(() => {
    set(label ?? null);
    return () => set(null);
  }, [label, set]);
}

/** Area › page › record. Everything but the last crumb links back up; phones show only the last. */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const detail = useContext(DetailContext);
  const all = detail ? [...crumbs, { label: detail }] : crumbs;

  return (
    <Breadcrumb className="min-w-0 flex-1">
      <BreadcrumbList className="flex-nowrap">
        {all.map((crumb, i) => {
          const last = i === all.length - 1;
          return (
            <Fragment key={`${i}-${crumb.label}`}>
              {i > 0 && <BreadcrumbSeparator className="hidden sm:block" />}
              <BreadcrumbItem className={last ? "min-w-0" : "hidden shrink-0 sm:inline-flex"}>
                {last || !crumb.href ? (
                  <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
