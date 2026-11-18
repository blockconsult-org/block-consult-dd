"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CustomSelect, type SelectProps } from "./select";

type ControlAttributes = Pick<React.InputHTMLAttributes<HTMLInputElement>, "id" | "aria-describedby" | "aria-invalid">;

interface FieldContextValue {
  controlId: string;
  descriptionIds?: string;
  invalid: boolean;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

function mergeIds(...values: (string | undefined)[]) {
  const ids = values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []);
  return ids.length ? [...new Set(ids)].join(" ") : undefined;
}

function controlAttributes(props: ControlAttributes, field: FieldContextValue | null): ControlAttributes {
  return {
    id: props.id ?? field?.controlId,
    "aria-describedby": mergeIds(props["aria-describedby"], field?.descriptionIds),
    "aria-invalid": field?.invalid ? true : props["aria-invalid"],
  };
}

export function Label({ children, className, htmlFor, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  const field = React.useContext(FieldContext);
  return <label htmlFor={htmlFor ?? field?.controlId} className={cn("label", className)} {...props}>{children}</label>;
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    const field = React.useContext(FieldContext);
    return <input ref={ref} className={cn("input", className)} {...props} {...controlAttributes(props, field)} />;
  },
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    const field = React.useContext(FieldContext);
    return <textarea ref={ref} className={cn("input min-h-24 resize-y", className)} {...props} {...controlAttributes(props, field)} />;
  },
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (props, ref) => {
    const field = React.useContext(FieldContext);
    return <CustomSelect ref={ref} {...props} {...controlAttributes(props, field)} />;
  },
);
Select.displayName = "Select";

function isKnownControl(child: React.ReactNode): child is React.ReactElement<ControlAttributes> {
  return React.isValidElement<ControlAttributes>(child) && (
    child.type === Input || child.type === Textarea || child.type === Select ||
    child.type === "input" || child.type === "textarea" || child.type === "select"
  );
}

interface FieldProps {
  label: React.ReactNode;
  children: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** ID for the control; use htmlFor when a custom or nested control supplies its own ID. */
  id?: string;
  htmlFor?: string;
  className?: string;
}

/** One labeled control. Shared inputs consume context; arbitrary child components are never cloned. */
export function Field({ label, children, hint, error, id, htmlFor, className }: FieldProps) {
  const generatedId = React.useId();
  const directControl = React.Children.toArray(children).find(isKnownControl);
  const controlId = directControl?.props.id ?? htmlFor ?? id ?? `field-${generatedId}`;
  const hasHint = hint !== undefined && hint !== null && hint !== "";
  const hasError = error !== undefined && error !== null && error !== "" && error !== false;
  const hintId = hasHint ? `${controlId}-hint` : undefined;
  const errorId = hasError ? `${controlId}-error` : undefined;
  const field = { controlId, descriptionIds: mergeIds(hintId, errorId), invalid: hasError };

  return (
    <FieldContext.Provider value={field}>
      <div className={cn("min-w-0", className)}>
        <Label>{label}</Label>
        {React.Children.map(children, (child) => {
          // Intrinsic controls cannot read context. Only clone these known HTML elements.
          if (isKnownControl(child) && typeof child.type === "string") {
            return React.cloneElement(child, controlAttributes(child.props, field));
          }
          return child;
        })}
        {hasHint && <p id={hintId} className="mt-2 text-xs leading-5 text-faint">{hint}</p>}
        {hasError && <p id={errorId} role="alert" className="mt-2 text-xs leading-5 text-danger">{error}</p>}
      </div>
    </FieldContext.Provider>
  );
}
