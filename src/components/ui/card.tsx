import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props}>{children}</div>;
}

interface CardHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

export function CardHeader({ title, subtitle, action, headingLevel = 2, className }: CardHeaderProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5", className)}>
      <div className="min-w-0 flex-1 basis-48">
        <Heading className="text-sm font-semibold leading-5 tracking-tight text-fg">{title}</Heading>
        {subtitle && <p className="mt-1 text-xs leading-5 text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex max-w-full flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-5 sm:px-5", className)} {...props}>{children}</div>;
}
