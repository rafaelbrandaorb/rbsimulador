import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[3px] border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "border-danger bg-danger text-primary-foreground hover:bg-danger/90",
        outline: "border-border-strong bg-panel-raised text-foreground hover:bg-accent",
        secondary: "border-border bg-secondary text-secondary-foreground hover:bg-accent",
        panel: "border-border-strong bg-panel-raised text-foreground hover:border-primary hover:bg-accent",
        run: "border-success bg-success-soft text-success-foreground hover:bg-success-soft/70",
        stop: "border-danger bg-danger-soft text-danger-foreground hover:bg-danger-soft/70",
        ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        link: "h-auto border-transparent bg-transparent px-0 text-primary underline-offset-4 hover:underline",
        danger: "border-danger bg-danger text-primary-foreground hover:bg-danger/90",
      },
      size: {
        sm: "h-7 px-2 text-[11px]",
        icon: "size-8 px-0",
        default: "h-8 px-3",
        lg: "h-10 px-5 text-sm",
      },
    },
    defaultVariants: { variant: "panel", size: "default" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = "Button";