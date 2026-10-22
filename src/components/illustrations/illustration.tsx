import { cn } from "@/lib/utils";
import { ILLUSTRATIONS, type IllustrationName } from "./svgs";

/**
 * An unDraw illustration that follows the theme. The markup is static and comes from this repository (see
 * svgs.ts), so inlining it is safe.
 */
export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block w-auto [&>svg]:h-full [&>svg]:w-auto", className)}
      dangerouslySetInnerHTML={{ __html: ILLUSTRATIONS[name] }}
    />
  );
}
