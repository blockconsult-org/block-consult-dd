"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type TriggerEvents = Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, "onFocus" | "onBlur" | "onKeyDown" | "onKeyUp" | "onClick" | "onPointerDown">;

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "multiple" | "size" | "value" | "defaultValue" | keyof TriggerEvents>, TriggerEvents {
  value?: string | number;
  defaultValue?: string | number;
}

interface Option {
  value: string;
  label: string;
  disabled: boolean;
  group?: string;
}

function optionText(children: React.ReactNode): string {
  return React.Children.toArray(children).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    return React.isValidElement<{ children?: React.ReactNode }>(child) ? optionText(child.props.children) : "";
  }).join("");
}

function readOptions(children: React.ReactNode, group?: string, disabled = false): Option[] {
  return React.Children.toArray(children).flatMap((child): Option[] => {
    if (!React.isValidElement<React.OptionHTMLAttributes<HTMLOptionElement>>(child)) return [];
    if (child.type === "option") {
      const label = child.props.label ?? optionText(child.props.children);
      return [{ value: String(child.props.value ?? optionText(child.props.children)), label, disabled: disabled || !!child.props.disabled, group }];
    }
    if (child.type === "optgroup") return readOptions(child.props.children, child.props.label, disabled || !!child.props.disabled);
    if (child.type === React.Fragment) return readOptions(child.props.children, group, disabled);
    return [];
  });
}

// Encoding every value allows an actual empty option without colliding with Radix's placeholder.
const encode = (value: string) => `option:${value}`;
const decode = (value: string) => value.slice("option:".length);

/** Custom presentation with a native bridge for FormData, refs, extraction, resets and validation. */
export const CustomSelect = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ children, className, style, value, defaultValue, disabled, required, id, title, autoFocus, tabIndex, onChange, onInvalid, onFocus, onBlur, onKeyDown, onKeyUp, onClick, onPointerDown, ...props }, forwardedRef) => {
    const generatedId = React.useId();
    const triggerId = id ?? `select-${generatedId}`;
    const native = React.useRef<HTMLSelectElement>(null);
    const trigger = React.useRef<HTMLButtonElement>(null);
    const resetting = React.useRef(false);
    const latestValue = React.useRef(value);
    const options = readOptions(children);
    const firstValue = options.find((option) => !option.disabled)?.value ?? "";
    const [current, setCurrent] = React.useState(String(value ?? defaultValue ?? firstValue));
    const [validation, setValidation] = React.useState("");
    const selected = value !== undefined ? String(value) : current;
    const selectedOption = options.find((option) => option.value === selected);
    const hasSelectedOption = selectedOption !== undefined;
    const validationId = `${triggerId}-validation`;
    const description = [props["aria-describedby"], validation ? validationId : undefined].filter(Boolean).join(" ") || undefined;

    React.useImperativeHandle(forwardedRef, () => native.current!, []);

    React.useLayoutEffect(() => {
      latestValue.current = value;
      if (!native.current) return;
      // Match native single-select fallback when an option disappears.
      const next = hasSelectedOption ? selected : firstValue;
      native.current.value = next;
      if (value === undefined && current !== next) setCurrent(next);
      if (validation && native.current.validity.valid) setValidation("");
    }, [hasSelectedOption, selected, firstValue, value, current, validation]);

    React.useEffect(() => {
      const form = native.current?.form;
      if (!form) return;
      let pendingReset: ReturnType<typeof setTimeout> | undefined;
      const reset = (event: Event) => {
        // Radix also listens for resets. The bridge owns reset semantics and must not emit change.
        resetting.current = true;
        clearTimeout(pendingReset);
        // A task runs after both native default actions and React's cancellable onReset handler.
        pendingReset = setTimeout(() => {
          if (!event.defaultPrevented) {
            if (native.current) {
              if (latestValue.current === undefined) setCurrent(native.current.value);
              else native.current.value = String(latestValue.current);
            }
            setValidation("");
          }
          resetting.current = false;
        });
      };
      form.addEventListener("reset", reset, true);
      return () => { clearTimeout(pendingReset); resetting.current = false; form.removeEventListener("reset", reset, true); };
    }, [props.form]);

    const choose = (encoded: string) => {
      if (resetting.current || !native.current) return;
      native.current.value = decode(encoded);
      native.current.dispatchEvent(new Event("change", { bubbles: true }));
    };

    const item = (option: Option) => (
      <SelectPrimitive.Item key={option.value} value={encode(option.value)} disabled={option.disabled} textValue={option.label}
        title={option.label} className="relative flex min-h-9 cursor-default select-none items-center rounded-sm py-2 pl-3 pr-9 text-sm leading-5 text-fg outline-none data-[disabled]:pointer-events-none data-[disabled]:text-faint data-[highlighted]:bg-elevated data-[highlighted]:text-fg data-[state=checked]:font-medium data-[highlighted]:ring-1 data-[highlighted]:ring-inset data-[highlighted]:ring-link">
        <SelectPrimitive.ItemText><span className="break-words [overflow-wrap:anywhere]">{option.label || "None"}</span></SelectPrimitive.ItemText>
        <SelectPrimitive.ItemIndicator className="absolute right-3 inline-flex items-center text-link"><Check aria-hidden className="h-4 w-4" /></SelectPrimitive.ItemIndicator>
      </SelectPrimitive.Item>
    );
    const groups = options.reduce<Array<{ label?: string; options: Option[] }>>((result, option) => {
      const previous = result.at(-1);
      if (previous && previous.label === option.group) previous.options.push(option);
      else result.push({ label: option.group, options: [option] });
      return result;
    }, []);

    return (
      <div className="relative min-w-0" onChange={(event) => {
        // Radix's nameless autofill bridge must not duplicate the named control's form events.
        if (event.nativeEvent.target !== native.current) event.stopPropagation();
      }}>
        <SelectPrimitive.Root value={selectedOption ? encode(selected) : encode(firstValue)} onValueChange={choose} disabled={disabled} dir={props.dir === "rtl" ? "rtl" : "ltr"}>
          <SelectPrimitive.Trigger ref={trigger} id={triggerId} autoFocus={autoFocus} tabIndex={tabIndex}
            onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown} onKeyUp={onKeyUp} onClick={onClick} onPointerDown={onPointerDown}
            aria-label={props["aria-label"]} aria-labelledby={props["aria-labelledby"]} aria-describedby={description}
            aria-invalid={validation ? true : props["aria-invalid"]} aria-required={required} title={title ?? selectedOption?.label}
            style={style} className={cn("input group relative flex items-center text-left pr-10", className)}>
            <span className="min-w-0 flex-1 truncate"><SelectPrimitive.Value>{(selectedOption ? selectedOption.label : options.find((option) => option.value === firstValue)?.label) || "None"}</SelectPrimitive.Value></span>
            <SelectPrimitive.Icon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" asChild>
              <ChevronDown aria-hidden className="h-4 w-4 transition-transform duration-160 ease-standard group-data-[state=open]:rotate-180" />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>
          <SelectPrimitive.Portal>
            <SelectPrimitive.Content position="popper" align="start" sideOffset={4} collisionPadding={8}
              className="z-[80] min-w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-content-available-width)] overflow-hidden rounded-md border border-line-strong bg-surface text-fg shadow-lg"
              style={{ maxHeight: "min(20rem, var(--radix-select-content-available-height))" }}>
              <SelectPrimitive.ScrollUpButton className="flex h-7 items-center justify-center border-b border-line bg-surface text-muted"><ChevronUp aria-hidden className="h-4 w-4" /></SelectPrimitive.ScrollUpButton>
              <SelectPrimitive.Viewport className="p-1">
                {groups.map((group, index) => group.label ? <SelectPrimitive.Group key={`${group.label}-${index}`}>
                  <SelectPrimitive.Label className="px-3 pb-1 pt-2 text-xs font-medium text-muted">{group.label}</SelectPrimitive.Label>
                  {group.options.map(item)}
                </SelectPrimitive.Group> : <React.Fragment key={index}>{group.options.map(item)}</React.Fragment>)}
              </SelectPrimitive.Viewport>
              <SelectPrimitive.ScrollDownButton className="flex h-7 items-center justify-center border-t border-line bg-surface text-muted"><ChevronDown aria-hidden className="h-4 w-4" /></SelectPrimitive.ScrollDownButton>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
        <select {...props} ref={native} id={`${triggerId}-native`} disabled={disabled} required={required}
          defaultValue={defaultValue ?? value ?? firstValue} aria-hidden="true" tabIndex={-1} className="sr-only pointer-events-none"
          onFocus={() => trigger.current?.focus()}
          onChange={(event) => { setCurrent(event.currentTarget.value); if (event.currentTarget.validity.valid) setValidation(""); onChange?.(event); }}
          onInvalid={(event) => { event.preventDefault(); setValidation(event.currentTarget.validationMessage); trigger.current?.focus(); onInvalid?.(event); }}>
          {children}
        </select>
        {validation && <p id={validationId} role="alert" className="mt-2 text-xs leading-5 text-danger">{validation}</p>}
      </div>
    );
  },
);
CustomSelect.displayName = "CustomSelect";
