import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A real <a> styled like a Button (use for navigation actions). */
export function LinkButton({
  href,
  variant,
  size,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & { href: string } & VariantProps<typeof buttonVariants>) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </Link>
  );
}
