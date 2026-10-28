"use client";

import { useSyncExternalStore } from "react";

/**
 * Which child a parent is currently managing. A per-device convenience kept in
 * localStorage; access is still checked by the services for every request.
 */
const KEY = "fahimni.activeChild";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActiveChild(userId: string): void {
  try {
    window.localStorage.setItem(KEY, userId);
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
  listeners.forEach((l) => l());
}

export function useActiveChildId(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => null,
  );
}
