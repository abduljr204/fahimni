/** Minimal typed pub/sub used to simulate realtime channels in prototype mode. */
export class EventBus<T> {
  private listeners = new Map<string, Set<(event: T) => void>>();

  on(channel: string, listener: (event: T) => void): () => void {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  emit(channel: string, event: T): void {
    this.listeners.get(channel)?.forEach((l) => l(event));
  }
}
