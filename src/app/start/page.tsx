"use client";

import { ArrowRightIcon, Building2Icon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Spinner } from "@/components/ui/spinner";
import { homeFor, useAccount } from "@/hooks/use-account";
import { useRequireSession } from "@/hooks/use-require-session";

const CHOICES = [
  {
    href: "/sme/register",
    icon: StoreIcon,
    title: "I run a small or medium business",
    description: "Register your SME, upload your compliance documents and get matched to tenders, RFQs and funding.",
  },
  {
    href: "/dashboard",
    icon: Building2Icon,
    title: "I represent a company or funder",
    description: "Set up your organisation, invite your team, post opportunities and review matched suppliers.",
  },
];

/** Where sign-in lands: forwards known accounts to their portal, and asks new ones which side they're on. */
export default function StartPage() {
  const router = useRouter();
  // Redirects to sign-in when signed out
  const { data: session } = useRequireSession();
  const account = useAccount();
  const home = account ? homeFor(account) : null;

  useEffect(() => {
    if (home) router.replace(home);
  }, [home, router]);

  if (!session || !account || home) return <Spinner className="mx-auto mt-24" />;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 md:py-20">
      <h1 className="text-3xl font-semibold tracking-tight">Welcome to YES Hub, {session.user.name.split(/\s+/)[0]}</h1>
      <p className="mt-2 text-muted-foreground">How will you use YES Hub? Each account is one or the other.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {CHOICES.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-xl border bg-card p-6 transition-colors outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Icon className="size-6 text-primary" />
            <h2 className="mt-4 font-semibold">{title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              Continue
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
