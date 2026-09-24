import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[3px] border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        panel: "border-border-strong bg-panel-raised text-foreground hover:border-primary hover:bg-accent",
        run: "border-success bg-success-soft text-success-foreground hover:bg-success-soft/70",
        stop: "border-danger bg-danger-soft text-danger-foreground hover:bg-danger-soft/70",
        ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        danger: "border-danger bg-danger text-primary-foreground hover:bg-danger/90",
      },
      size: {
        sm: "h-7 px-2 text-[11px]",
        icon: "size-8 px-0",
        default: "h-8 px-3",
      },
    },
    defaultVariants: { variant: "panel", size: "default" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}