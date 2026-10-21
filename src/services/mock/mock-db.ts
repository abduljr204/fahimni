import { createSeed, MOCK_STATE_VERSION, type MockState } from "./seed";

/**
 * In-browser database for prototype mode. State lives in memory and is mirrored to
 * localStorage so a demo survives page reloads. On the server (SSR) a fresh seed is
 * used and nothing is persisted.
 */

const STORAGE_KEY = "fahimni.prototype.db";

type Listener = () => void;

class MockDatabase {
  private state: MockState | null = null;
  private listeners = new Set<Listener>();

  get data(): MockState {
    if (!this.state) this.state = this.load();
    return this.state;
  }

  /** Applies a mutation, persists it and notifies subscribers. */
  mutate<T>(fn: (state: MockState) => T): T {
    const result = fn(this.data);
    this.persist();
    this.listeners.forEach((l) => l());
    return result;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    const sessionUserId = this.data.sessionUserId;
    this.state = { ...createSeed(), sessionUserId };
    this.persist();
    this.listeners.forEach((l) => l());
  }

  private load(): MockState {
    if (typeof window === "undefined") return createSeed();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MockState;
        if (parsed.version === MOCK_STATE_VERSION) return parsed;
      }
    } catch {
      // Corrupted or blocked storage: fall back to a fresh seed.
    }
    const seed = createSeed();
    this.state = seed;
    this.persist();
    return seed;
  }

  private persist(): void {
    if (typeof window === "undefined" || !this.state) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage full or disabled (e.g. private mode). The demo keeps working in memory.
    }
  }
}

export const mockDb = new MockDatabase();

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Simulated network latency so loading states are visible in the prototype. */
export function latency(min = 250, max = 650): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deep-copies records handed to the UI so callers can't mutate the store directly. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}
