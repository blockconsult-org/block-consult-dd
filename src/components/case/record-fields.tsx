import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { titleCase } from "@/lib/utils";
import type { FieldDef, RecordDef } from "@/domain/record-fields";

export function recordFieldValue(field: FieldDef, value: unknown): string {
  if (field.kind === "lines" && typeof value === "string") {
    try {
      const list: unknown = JSON.parse(value);
      if (Array.isArray(list)) return list.filter((item): item is string => typeof item === "string").join("\n");
    } catch { /* Keep legacy text visible for review. */ }
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function RecordFields({ def, values, editing = false }: { def: RecordDef; values?: Record<string, unknown>; editing?: boolean }) {
  return def.fields.filter((field) => !editing || !["allocationsText", "unlocksText"].includes(field.name)).map((field) => {
    const value = recordFieldValue(field, values?.[field.name]);
    return (
      <div key={field.name} className={field.full || field.kind === "textarea" ? "sm:col-span-2" : ""}>
        {field.kind === "bool" ? (
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-fg">
            <input type="checkbox" name={field.name} defaultChecked={values?.[field.name] === true} className="h-4 w-4 rounded border-control accent-accent" />{field.label}
          </label>
        ) : (
          <Field label={`${field.label}${field.required ? " *" : ""}`} hint={field.hint}>
            {field.kind === "textarea" || field.kind === "lines" ? <Textarea name={field.name} defaultValue={value} required={field.required} />
              : field.kind === "select" ? <Select name={field.name} defaultValue={editing ? value : field.options?.[0]}>
                {editing && value && !field.options?.includes(value) && <option value={value}>{titleCase(value)}</option>}
                {(field.options ?? []).map((option) => <option key={option} value={option}>{titleCase(option)}</option>)}
              </Select>
                : <Input name={field.name} defaultValue={value} type={field.kind === "number" ? "number" : "text"} step={field.kind === "number" ? "any" : undefined} required={field.required} />}
          </Field>
        )}
      </div>
    );
  });
}
