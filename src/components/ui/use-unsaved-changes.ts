"use client";

import { useEffect, useRef } from "react";

const dirtyForms = new Set<symbol>();
let listening = false;

export function confirmDiscardChanges(): boolean {
  return dirtyForms.size === 0 || window.confirm("Leave without saving? Your unsaved changes will be lost.");
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (dirtyForms.size === 0) return;
  event.preventDefault();
  event.returnValue = "";
}

function beforeNavigate(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
  const next = new URL(link.href, window.location.href);
  if (next.origin === window.location.origin && next.pathname === window.location.pathname) return;
  if (!confirmDiscardChanges()) {
    event.preventDefault();
    event.stopPropagation();
  }
}

/** Warn before discarding edits; tab and section changes keep mounted drafts. */
export function useUnsavedChanges(dirty: boolean) {
  const key = useRef(Symbol("draft"));
  useEffect(() => {
    const id = key.current;
    if (dirty) dirtyForms.add(id);
    else dirtyForms.delete(id);
    if (dirtyForms.size > 0 && !listening) {
      window.addEventListener("beforeunload", beforeUnload);
      document.addEventListener("click", beforeNavigate, true);
      listening = true;
    }
    return () => {
      dirtyForms.delete(id);
      if (dirtyForms.size === 0 && listening) {
        window.removeEventListener("beforeunload", beforeUnload);
        document.removeEventListener("click", beforeNavigate, true);
        listening = false;
      }
    };
  }, [dirty]);
}

const HISTORY_INDEX = "__bcDraftHistoryIndex";
function historyIndex(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[HISTORY_INDEX];
  return typeof value === "number" ? value : null;
}
function indexedState(state: unknown, index: number): Record<string, unknown> {
  return { ...(state && typeof state === "object" ? state : {}), [HISTORY_INDEX]: index };
}

/** Mount once in the shell so Back/Forward can restore a cancelled navigation. */
export function useDraftNavigationGuard() {
  useEffect(() => {
    const push = window.history.pushState;
    const replace = window.history.replaceState;
    let currentIndex = historyIndex(window.history.state) ?? 0;
    let currentUrl = window.location.href;
    let restoring = false;
    replace.call(window.history, indexedState(window.history.state, currentIndex), "");

    const pushWithIndex = function (state: unknown, unused: string, url?: string | URL | null) {
      const next = currentIndex + 1;
      push.call(window.history, indexedState(state, next), unused, url);
      currentIndex = next;
      currentUrl = window.location.href;
    };
    const replaceWithIndex = function (state: unknown, unused: string, url?: string | URL | null) {
      replace.call(window.history, indexedState(state, currentIndex), unused, url);
      currentUrl = window.location.href;
    };
    window.history.pushState = pushWithIndex;
    window.history.replaceState = replaceWithIndex;

    const onPopState = (event: PopStateEvent) => {
      const nextIndex = historyIndex(event.state);
      if (restoring) {
        restoring = false;
        event.stopImmediatePropagation();
        return;
      }
      const leavingPage = new URL(currentUrl).pathname !== window.location.pathname;
      if (nextIndex !== null && leavingPage && !confirmDiscardChanges()) {
        event.stopImmediatePropagation();
        restoring = true;
        window.history.go(currentIndex - nextIndex);
        return;
      }
      currentIndex = nextIndex ?? currentIndex;
      currentUrl = window.location.href;
    };
    window.addEventListener("popstate", onPopState, true);
    return () => {
      window.removeEventListener("popstate", onPopState, true);
      if (window.history.pushState === pushWithIndex) window.history.pushState = push;
      if (window.history.replaceState === replaceWithIndex) window.history.replaceState = replace;
    };
  }, []);
}
