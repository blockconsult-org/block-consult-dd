import * as React from "react";
import { createRoot } from "react-dom/client";
import * as Dialog from "@radix-ui/react-dialog";
import { Field, Select } from "../src/components/ui/field";
import { ThemeSelect } from "../src/components/shell/theme-select";

function Fixture() {
  const [controlled, setControlled] = React.useState("");
  const [entries, setEntries] = React.useState<Array<[string, FormDataEntryValue]>>([]);
  const [changes, setChanges] = React.useState(0);
  const [nativeEvent, setNativeEvent] = React.useState(false);
  const [beta, setBeta] = React.useState(true);
  const [cancelReset, setCancelReset] = React.useState(false);
  const [resetControlled, setResetControlled] = React.useState(false);
  const nativeRef = React.useRef<HTMLSelectElement>(null);
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Select regression fixture</h1>
      <form id="fixture-form" className="grid gap-4" onChange={() => setChanges((count) => count + 1)}
        onReset={(event) => { if (cancelReset) event.preventDefault(); else if (resetControlled) setControlled("alpha"); }}
        onSubmit={(event) => { event.preventDefault(); setEntries([...new FormData(event.currentTarget).entries()]); }}>
        <Field label="Required choice" hint="Choose an enabled option.">
          <Select name="required" required ref={nativeRef} value={controlled} onChange={(event) => {
            setNativeEvent(event.target instanceof HTMLSelectElement && event.currentTarget instanceof HTMLSelectElement);
            setControlled(event.target.value);
          }}>
            <option value="">Choose an option</option>
            <optgroup label="Available">
              <option value="alpha">Alpha</option>
              <option value="blocked" disabled>Blocked</option>
              <option value="beta">Beta</option>
              <option value="delta">Delta</option>
            </optgroup>
            <optgroup label="Unavailable" disabled><option value="group-disabled">Group disabled</option></optgroup>
          </Select>
        </Field>
        <Field label="Default choice"><Select name="default" defaultValue="beta"><option value="">None</option><option value="alpha">Alpha</option>{beta && <option value="beta">Beta</option>}</Select></Field>
        <Field label="Optional choice"><Select name="optional" defaultValue=""><option value="">Not specified</option><option value="alpha">Alpha</option></Select></Field>
        <Field label="Disabled choice"><Select name="disabled" disabled defaultValue="alpha"><option value="alpha">Alpha</option></Select></Field>
        <fieldset disabled><legend>Disabled group</legend><Field label="Fieldset choice"><Select name="fieldset" defaultValue="alpha"><option value="alpha">Alpha</option></Select></Field></fieldset>
        <div className="flex flex-wrap gap-3"><button type="submit">Submit choices</button><button type="reset">Reset choices</button></div>
      </form>
      <Field label="External choice"><Select name="external" form="fixture-form" defaultValue="alpha"><option value="alpha">Alpha</option><option value="beta">Beta</option></Select></Field>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setControlled("beta")}>Set controlled value</button>
        <button type="button" onClick={() => setBeta(false)}>Remove Beta option</button>
        <button type="button" onClick={() => nativeRef.current?.focus()}>Focus native ref</button>
        <button type="button" onClick={() => setCancelReset(!cancelReset)}>Cancel resets: {String(cancelReset)}</button>
        <button type="button" onClick={() => setResetControlled(!resetControlled)}>Reset controlled value: {String(resetControlled)}</button>
      </div>
      <output id="entries">{JSON.stringify(entries)}</output>
      <output id="changes">{changes}</output>
      <output id="native-event">{String(nativeEvent)}</output>
      <div className="flex gap-4"><ThemeSelect label="Header appearance" /><ThemeSelect label="Settings appearance" /></div>
      <Dialog.Root>
        <Dialog.Trigger asChild><button type="button">Open edge dialog</button></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed bottom-4 right-4 z-50 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-line bg-surface p-4">
            <Dialog.Title>Dialog select</Dialog.Title>
            <Dialog.Description>Menu remains visible above this clipped dialog.</Dialog.Description>
            <Field label="Long choice"><Select defaultValue="1">
              {Array.from({ length: 40 }, (_, index) => <option key={index} value={index + 1}>{`Option ${index + 1}${index === 39 ? " with an unusually long label that must wrap without leaving the window" : ""}`}</option>)}
            </Select></Field>
            <Dialog.Close asChild><button type="button">Close dialog</button></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
