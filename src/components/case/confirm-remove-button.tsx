"use client";
import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Keep the confirmation open when a request fails, so the user can retry. */
export function ConfirmRemoveButton({ label, description, disabled, onRemove }: {
  label: string;
  description: string;
  disabled?: boolean;
  onRemove: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [failed, setFailed] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  async function remove() {
    setRemoving(true);
    setFailed(false);
    try {
      if (await onRemove()) setOpen(false);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setRemoving(false);
    }
  }
  return (
    <Dialog.Root open={open} onOpenChange={(value) => { if (!removing) { setOpen(value); setFailed(false); } }}>
      <Dialog.Trigger asChild><Button type="button" size="sm" variant="ghost" disabled={disabled} aria-label={`Remove ${label}`} className="shrink-0 text-muted hover:text-danger"><Trash2 className="h-4 w-4" aria-hidden="true" />Remove</Button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content onOpenAutoFocus={(event) => { event.preventDefault(); cancel.current?.focus(); }}
          onEscapeKeyDown={(event) => { if (removing) event.preventDefault(); }} onPointerDownOutside={(event) => { if (removing) event.preventDefault(); }}
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-xl">
          <AlertTriangle className="mb-4 h-6 w-6 text-danger" aria-hidden="true" />
          <Dialog.Title className="break-words text-lg font-semibold text-fg">Remove {label}?</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">{description}</Dialog.Description>
          {failed && <p role="alert" className="mt-4 text-sm text-danger">Could not remove this item. Try again or cancel to keep it.</p>}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild><Button ref={cancel} type="button" variant="outline" disabled={removing}>Cancel</Button></Dialog.Close>
            <Button type="button" variant="danger" disabled={removing} onClick={() => void remove()}>{removing ? "Removing…" : "Remove"}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
