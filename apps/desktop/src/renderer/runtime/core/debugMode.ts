let getRuntimeDebugModeEnabled = (): boolean => false;

export function configureRuntimeDebugMode(getter: () => boolean): void {
  getRuntimeDebugModeEnabled = getter;
}

export function isRuntimeDebugModeEnabled(): boolean {
  return getRuntimeDebugModeEnabled();
}
