"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TryField } from "@/lib/try/fields";

/**
 * The try form's fields, generated from a playbook's `inputs`.
 *
 * Eight input types, one component, because a playbook author picks a type in
 * YAML and never writes a component. The eight are rendered rather than dropped
 * for being unhandled: an unknown type falls back to a text input, so a new type
 * in the schema degrades to something usable instead of a form with a hole in it.
 *
 * Nothing here sends anything anywhere. Values live in the parent component's
 * React state and are read by the template renderer in this browser tab; there is
 * no fetch, no server action and no analytics call in this file. That is the
 * privacy requirement in AGENTS.md, and it is enforced by there being no code
 * path here that could transmit a value.
 */

const LABEL_CLASS = "text-sm font-medium";

/**
 * The required/optional line under a label.
 *
 * `optional · <why it helps>` rather than a bare "(optional)", because the brief
 * asks for the reason as well as the flag — a field a reader can skip still needs
 * to say what skipping costs them. Required fields get no suffix at all: every
 * required field marking itself required is noise, and the asterisk-free
 * treatment keeps the eye on the ones that matter.
 */
function OptionalNote({ field }: { field: TryField }) {
  if (field.required) {
    return null;
  }

  return (
    <span className="ml-1.5 font-normal text-muted-foreground">
      optional{field.why_it_helps ? ` · ${field.why_it_helps}` : ""}
    </span>
  );
}

function FieldShell({
  field,
  htmlFor,
  children,
}: {
  field: TryField;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className={LABEL_CLASS}>
        {field.label}
        {field.required ? <span aria-hidden className="text-muse"> *</span> : null}
        <OptionalNote field={field} />
      </label>
      {children}
    </div>
  );
}

export function TryFieldInput({
  field,
  value,
  onChange,
  invalid,
}: {
  field: TryField;
  value: string;
  onChange: (value: string) => void;
  /** Set after a copy/open attempt with a required field left blank. */
  invalid?: boolean;
}) {
  const id = `try-field-${field.id}`;
  // Large tap targets throughout: this form is filled in on a phone, and a
  // 32px-tall input is a mis-tap waiting to happen.
  const controlClass = "h-12";

  if (field.type === "provider_picker" || field.type === "select") {
    const options = field.options ?? [];

    return (
      <FieldShell field={field} htmlFor={id}>
        {options.length === 0 ? (
          // An author who declared a picker with no options would otherwise get a
          // control that cannot be used. Say so rather than render nothing.
          <p className="text-sm text-muted-foreground">No options configured for this field.</p>
        ) : (
          <ul className="flex flex-wrap gap-2" data-testid={`try-field-group-${field.key}`}>
            {options.map((option) => {
              const selected = value === option;

              return (
                <li key={option}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange(option)}
                    data-testid={`try-option-${field.key}-${option}`}
                    className={[
                      "min-h-11 rounded-full border px-4 text-sm transition-colors",
                      selected
                        ? "border-muse bg-muse text-white"
                        : "border-border bg-card hover:bg-muted/40",
                    ].join(" ")}
                  >
                    {option}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </FieldShell>
    );
  }

  if (field.type === "textarea") {
    return (
      <FieldShell field={field} htmlFor={id}>
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder ?? ""}
          rows={4}
          aria-invalid={invalid || undefined}
          className="text-base"
        />
      </FieldShell>
    );
  }

  const inputType =
    field.type === "number" || field.type === "money" ? "number" : field.type === "date" ? "date" : "text";

  return (
    <FieldShell field={field} htmlFor={id}>
      <div className="relative">
        <Input
          id={id}
          type={inputType}
          inputMode={
            // A numeric keypad on a phone, which is what the brief asks for and
            // what `type="text"` would fail to give.
            field.type === "zip" ? "numeric" : field.type === "money" || field.type === "number" ? "decimal" : undefined
          }
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder ?? ""}
          aria-invalid={invalid || undefined}
          className={controlClass}
          // ZIP codes keep their leading zeros in a numeric keypad on iOS only
          // when the value stays a string, which is why this is `text` with a
          // numeric keyboard rather than `number`.
          autoComplete={field.type === "zip" ? "postal-code" : "off"}
        />
        {field.type === "money" ? (
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted-foreground">
            $
          </span>
        ) : null}
      </div>
    </FieldShell>
  );
}

