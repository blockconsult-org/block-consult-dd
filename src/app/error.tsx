"use client";

import Link from "next/link";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="card mx-auto max-w-xl p-6 sm:p-8" aria-labelledby="page-error-title">
    <AlertCircle aria-hidden className="h-6 w-6 text-danger" />
    <h1 id="page-error-title" className="mt-4 text-2xl font-semibold tracking-tight">This page could not load</h1>
    <p className="mt-3 text-sm leading-6 text-muted">Try loading it again. If the problem continues, reopen the app. Your saved cases remain on this computer.</p>
    <div className="mt-6 flex flex-wrap gap-3">
      <Button onClick={reset}><RotateCcw aria-hidden className="h-4 w-4" /> Try again</Button>
      <Button asChild variant="outline"><Link href="/">All cases</Link></Button>
    </div>
  </section>;
}
