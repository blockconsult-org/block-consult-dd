"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent font-medium leading-5 transition-colors duration-160 ease-standard disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link focus-visible:ring-offset-2 focus-visible:ring-offset-bg [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg hover:bg-accent-dim active:bg-accent-dim",
        accent: "bg-accent text-accent-fg hover:bg-accent-dim active:bg-accent-dim",
        outline: "border-line-strong bg-surface text-fg hover:border-control hover:bg-elevated active:bg-elevated",
        ghost: "text-muted hover:bg-elevated hover:text-fg active:bg-elevated",
        danger: "bg-danger-solid text-white hover:bg-danger-solid/90 active:bg-danger-solid",
        subtle: "bg-elevated text-fg hover:border-line-strong active:border-control",
      },
      size: {
        default: "min-h-11 px-4 py-2 text-sm",
        sm: "min-h-11 px-3 py-2 text-xs sm:min-h-10",
        lg: "min-h-12 px-5 py-3 text-sm",
        icon: "h-11 w-11 sm:h-10 sm:w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  },
);
Button.displayName = "Button";
