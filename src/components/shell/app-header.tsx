"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, Menu, Plus, Settings, X } from "lucide-react";
import { AiStatusPill } from "@/components/ai-status-pill";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import mark from "../../../public/blockconsult-mark.png";
import { ThemeSelect } from "./theme-select";

const navigation = [
  { href: "/", label: "Cases", Icon: FolderOpen },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function AppHeader() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const headerRef = React.useRef<HTMLElement>(null);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const locked = pathname === "/unlock";

  React.useEffect(() => { setOpen(false); }, [pathname]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); menuButtonRef.current?.focus(); }
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setOpen(false);
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open]);

  const links = navigation.map(({ href, label, Icon }) => {
    const active = href === "/" ? pathname === "/" || pathname.startsWith("/cases") : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? (pathname === href ? "page" : "location") : undefined}
        onClick={() => setOpen(false)}
        className={cn("inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-160 ease-standard md:min-h-10", active ? "bg-elevated text-fg" : "text-muted hover:bg-elevated hover:text-fg")}
      >
        <Icon aria-hidden className="h-4 w-4" />
        {label}
      </Link>
    );
  });

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur-xl">
      <a href="#main-content" className="sr-only absolute left-4 top-3 z-50 rounded-md bg-accent px-4 py-3 font-medium text-accent-fg focus:not-sr-only focus:absolute">Skip to content</a>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <Link href="/" aria-label="Block Consult due diligence — cases" className="mr-auto flex min-w-0 items-center gap-2.5 rounded-sm md:mr-2">
          <Image src={mark} alt="" priority className="h-8 w-8 shrink-0 select-none" />
          <span className="min-w-0">
            <span className="block whitespace-nowrap text-sm font-semibold tracking-tight text-fg">Block Consult</span>
            <span className="block font-mono text-[10px] uppercase tracking-wider text-muted">Due diligence</span>
          </span>
        </Link>
        {!locked && <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">{links}</nav>}
        <div className="flex shrink-0 items-center gap-2 md:ml-auto">
          {!locked && <div className="hidden xl:block"><AiStatusPill /></div>}
          <ThemeSelect />
          {!locked && <Button asChild className="h-11 w-11 p-0 sm:w-auto sm:px-3"><Link href="/cases/new" aria-label="New case"><Plus aria-hidden className="h-4 w-4" /><span className="hidden sm:inline">New case</span></Link></Button>}
          {!locked && <Button ref={menuButtonRef} type="button" size="icon" variant="outline" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)} className="md:hidden">{open ? <X aria-hidden className="h-4 w-4" /> : <Menu aria-hidden className="h-4 w-4" />}</Button>}
        </div>
      </div>
      {!locked && open && <nav id="mobile-navigation" aria-label="Mobile navigation" className="absolute inset-x-0 top-full grid gap-1 border-b border-line bg-surface px-4 py-3 shadow-lg md:hidden">{links}</nav>}
    </header>
  );
}
