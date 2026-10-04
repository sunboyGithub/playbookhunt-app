import { CalendarDays, Clock, FileText, Hash, Link2, ListChecks, Type } from "lucide-react";

/**
 * Just the fields this component reads.
 *
 * Not `PlaybookInput`, and deliberately: `getVersionContent` selects a subset of
 * that row, so typing the prop as the whole row would demand a `version_id`
 * nobody selected and force the query to widen to satisfy a component that has
 * no use for it. Structural typing means the narrower list is still assignable
 * wherever a full row is.
 */
type Input = {
  id: string;
  label: string;
  help: string | null;
  why_it_helps: string | null;
  type: string;
  required: boolean;
};

/**
 * "What you'll need": the inputs a reader gathers before starting, each marked
 * Required or Optional.
 *
 * The icon is by *input type*, not by the label. A reader scanning this list is
 * working out what to go and fetch, so the icon has to encode the kind of thing
 * — a date field is something you look up, a file is something you attach, a
 * short answer is something you type. Decoration keyed to the label would say
 * the same thing the label already says and cost a tree-shaken import per row.
 *
 * An unknown type falls back to a generic glyph rather than rendering nothing.
 * A new input type added to the schema should degrade to "some input", not to
 * an empty space where a row's only distinguishing mark should be.
 */
const ICONS: Record<string, typeof Type> = {
  text: Type,
  textarea: FileText,
  url: Link2,
  number: Hash,
  date: CalendarDays,
  duration: Clock,
  select: ListChecks,
  multi_select: ListChecks,
};

export function InputsList({ inputs }: { inputs: Input[] }) {
  if (inputs.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="inputs-heading">
      <h2 id="inputs-heading" className="text-lg font-semibold">
        What you&apos;ll need
      </h2>

      <ul className="mt-3 space-y-3">
        {inputs.map((input) => {
          const Icon = ICONS[input.type] ?? Type;

          return (
            <li key={input.id} className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"
              >
                <Icon className="size-4 text-muted-foreground" />
              </span>

              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {input.label}
                  {/* Required first and unmarked-but-bold rather than two
                      different styles, so "optional" is the thing that has to be
                      explained and "required" is the default reading. */}
                  {input.required ? (
                    <span className="text-xs font-semibold text-brand">Required</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Optional</span>
                  )}
                </p>

                {input.help ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{input.help}</p>
                ) : null}

                {/* Why an *optional* field is optional is the part that is
                    genuinely useful — it tells the reader what they give up by
                    skipping it. A required field needs no such explanation. */}
                {input.why_it_helps ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Without it: {input.why_it_helps}.
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}