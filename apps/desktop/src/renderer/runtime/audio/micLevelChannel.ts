type Listener = (level: number) => void;

const listeners = new Set<Listener>();
let currentLevel = 0;
let lastSetAt = 0;

export const micLevelChannel = {
  setLevel(level: number): void {
    currentLevel = level;
    lastSetAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    for (const listener of listeners) {
      listener(level);
    }
  },
  getLevel(): number {
    return currentLevel;
  },
  getLastSetAt(): number {
    return lastSetAt;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  reset(): void {
    currentLevel = 0;
    lastSetAt = 0;
    for (const listener of listeners) {
      listener(0);
    }
  },
};
