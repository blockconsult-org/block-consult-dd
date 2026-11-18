"use client";

import { forwardRef, useCallback, useEffect, useRef, useState, type FormHTMLAttributes } from "react";
import { useUnsavedChanges } from "./use-unsaved-changes";

function snapshot(form: HTMLFormElement): string {
  const values: unknown[] = [];
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || !element.name) continue;
    if (element instanceof HTMLInputElement) {
      if (["button", "submit", "reset"].includes(element.type)) continue;
      if (element.type === "checkbox" || element.type === "radio") { values.push([element.name, element.checked, element.value]); continue; }
      if (element.type === "file") { values.push([element.name, Array.from(element.files ?? [], (file) => `${file.name}:${file.size}:${file.lastModified}`)]); continue; }
    }
    values.push([element.name, element.value]);
  }
  return JSON.stringify(values);
}

/** Uncontrolled form with a reset-aware dirty baseline and navigation protection. */
export const DraftForm = forwardRef<HTMLFormElement, FormHTMLAttributes<HTMLFormElement> & { saved?: boolean }>(
  function DraftForm({ onChange, onReset, onInput, saved = false, ...props }, forwardedRef) {
    const form = useRef<HTMLFormElement | null>(null);
    const baseline = useRef<string | null>(null);
    const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [dirty, setDirty] = useState(false);
    const check = useCallback(() => {
      if (form.current) setDirty(snapshot(form.current) !== baseline.current);
    }, []);
    useUnsavedChanges(dirty && !saved);
    useEffect(() => {
      if (form.current) baseline.current = snapshot(form.current);
      return () => { if (resetTimer.current !== null) clearTimeout(resetTimer.current); };
    }, []);
    return <form {...props}
      ref={(node) => {
        form.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      onChange={(event) => { onChange?.(event); check(); }}
      onInput={(event) => { onInput?.(event); check(); }}
      onReset={(event) => {
        onReset?.(event);
        if (event.defaultPrevented) return;
        if (resetTimer.current !== null) clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => {
          resetTimer.current = null;
          if (event.defaultPrevented || !form.current) return;
          baseline.current = snapshot(form.current);
          setDirty(false);
        }, 0);
      }}
    />;
  },
);
