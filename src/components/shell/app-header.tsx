"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, Plus, Settings } from "lucide-react";
import { AiStatusPill } from "@/components/ai-status-pill";
import { Button } from "@/components/ui/button";
import { useDraftNavigationGuard } from "@/components/ui/use-unsaved-changes";
import { cn } from "@/lib/utils";
import mark from "../../../public/blockconsult-mark.png";
import { ThemeSelect } from "./theme-select";

const navigation = [
  { href: "/", label: "Cases", Icon: FolderOpen },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function AppHeader() {
  useDraftNavigationGuard();
  const pathname = usePathname();
  const locked = pathname === "/unlock";

  const links = navigation.map(({ href, label, Icon }) => {
    const active = href === "/" ? pathname === "/" || pathname.startsWith("/cases") : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? (pathname === href ? "page" : "location") : undefined}
        aria-label={label}
        title={label}
        className={cn("inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-160 ease-standard md:min-h-10", active ? "bg-accent/10 text-link" : "text-muted hover:bg-elevated hover:text-fg")}
      >
        <Icon aria-hidden className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
      </Link>
    );
  });

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur-xl">
      <a href="#main-content" className="sr-only absolute left-4 top-3 z-50 rounded-md bg-accent px-4 py-3 font-medium text-accent-fg focus:not-sr-only focus:absolute">Skip to content</a>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <Link href="/" aria-label="Block Consult due diligence, cases" className="flex min-w-0 items-center gap-2.5 rounded-sm md:mr-2">
          <Image src={mark} alt="" priority className="h-8 w-8 shrink-0 select-none" />
          <span className="hidden min-w-0 sm:block">
            <span className="block whitespace-nowrap text-sm font-semibold tracking-tight text-fg">Block Consult</span>
            <span className="block font-mono text-[10px] uppercase tracking-wider text-muted">Due diligence</span>
          </span>
        </Link>
        {!locked && <nav aria-label="Main navigation" className="flex items-center gap-1">{links}</nav>}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!locked && <div className="hidden xl:block"><AiStatusPill /></div>}
          <ThemeSelect compact />
          {!locked && pathname !== "/" && pathname !== "/cases/new" && <Button asChild className="h-11 w-11 p-0 sm:w-auto sm:px-3"><Link href="/cases/new" aria-label="New case"><Plus aria-hidden className="h-4 w-4" /><span className="hidden sm:inline">New case</span></Link></Button>}
        </div>
      </div>
    </header>
  );
}
