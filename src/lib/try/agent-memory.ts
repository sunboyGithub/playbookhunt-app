"use client";

import { useSyncExternalStore } from "react";

/**
 * The last agent this browser chose, as external state.
 *
 * `localStorage` is a store outside React, so it is read with
 * `useSyncExternalStore` rather than copied into state inside an effect. That is
 * not a style preference: the effect version sets state synchronously on mount,
 * which the React Compiler rejects as a cascading render, and it also logs the
 * `started` try event against the *default* agent before the remembered one
 * arrives — so a returning reader's first try would be attributed to an agent
 * they did not pick.
 *
 * `useSyncExternalStore` also gets hydration right for free. During the first
 * client render React uses `getServerSnapshot`, so server and client markup
 * agree; by the time effects run, the real value has been delivered.
 */

const AGENT_KEY = "ph_last_agent";
const REMINDER_KEY = "ph_reminder_dismissed";

/** Every mounted subscriber, so a write can notify readers in this tab too. */
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // The `storage` event covers other tabs; `emit` covers this one.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private browsing, storage disabled, or a quota error. Every caller has a
    // default, so a null here is a normal answer rather than a failure.
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    emit();
  } catch {
    // Nothing depends on the write landing; the value is a convenience.
  }
}

/** The remembered agent slug, or null. Never throws. */
export function useRememberedAgent(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => read(AGENT_KEY),
    () => null,
  );
}

export function rememberAgent(slug: string) {
  write(AGENT_KEY, slug);
}

/** Whether the reader has already dismissed the sign-in reminder card. */
export function useReminderDismissed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read(REMINDER_KEY) === "1",
    () => true,
  );
}

export function dismissReminder() {
  write(REMINDER_KEY, "1");
}