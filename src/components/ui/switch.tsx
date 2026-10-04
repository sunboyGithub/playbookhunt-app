"use client"

import * as React from "react"
import { cn } from "cn"
import { Switch as SwitchPrimitive } from "radix-ui"

/**
 * A switch, not a checkbox.
 *
 * The distinction is the whole reason this component exists: a checkbox asks
 * "do you want this?", a switch shows a state that is true right now. The one
 * setting on `/me` is already on by default, so the reader is being told a fact
 * about their account rather than asked to tick a box — and a control that
 * reads as a fact should look like one.
 *
 * `--brand` rather than `--primary` because this site's accent *is* the orange;
 * a switch in another colour would be the one control on the page that doesn't
 * belong to the design.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-brand data-unchecked:bg-input dark:data-unchecked:bg-input/80",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-background shadow-sm ring-0 transition-transform data-checked:translate-x-5 data-unchecked:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }