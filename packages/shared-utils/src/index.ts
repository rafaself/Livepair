export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

export function noop(): void {
  // intentional no-op placeholder
}
