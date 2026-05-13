import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Primary brand CTA — gradient background (indigo → violet → pink),
 * white text, subtle lift on hover. Use for the *single* most important
 * action on a page.
 *
 * The "soft" variant uses a faint tint background with brand-colored
 * text — for secondary brand actions that shouldn't dominate the page.
 *
 * For composing with `<Link>` from next/link, use the exported
 * `brandButton()` variants utility directly:
 *   <Link href="/x" className={brandButton({ variant: "gradient" })}>
 */
export const brandButton = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        gradient:
          "bg-brand-gradient text-white shadow-card hover:shadow-card-hover hover:-translate-y-0.5 active:translate-y-0",
        soft:
          "bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/60",
        outline:
          "border border-border bg-card text-foreground hover:bg-accent",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-6 text-sm",
        xl: "h-12 px-7 text-base",
      },
    },
    defaultVariants: {
      variant: "gradient",
      size: "md",
    },
  },
);

export type BrandButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof brandButton>;

export function BrandButton({ className, variant, size, ...props }: BrandButtonProps) {
  return <button className={cn(brandButton({ variant, size }), className)} {...props} />;
}
