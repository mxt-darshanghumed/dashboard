import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:brightness-110 active:brightness-95 shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_8px_20px_-8px_color-mix(in_oklch,var(--color-accent)_40%,transparent)]",
        secondary:
          "border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)] hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-fg-dim)]",
        ghost:
          "text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-fg)]",
        outline:
          "border border-[var(--color-border)] text-[var(--color-fg)] hover:bg-[var(--color-bg-elevated)]",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-10 px-5 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";
