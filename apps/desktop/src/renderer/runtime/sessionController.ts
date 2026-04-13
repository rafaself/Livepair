import { createSessionControllerAssembly } from './session/sessionControllerAssembly';
import type {
  DesktopSessionController,
  DesktopSessionControllerDependencies,
} from './core/sessionControllerTypes';
import { createDesktopSessionControllerDependencies } from './host/createDesktopSessionControllerDependencies';

export type {
  DesktopSessionController,
  DesktopSessionControllerDependencies,
} from './core/sessionControllerTypes';

function resolveDesktopSessionControllerDependencies(
  overrides: Partial<DesktopSessionControllerDependencies>,
): DesktopSessionControllerDependencies {
  return createDesktopSessionControllerDependencies(overrides);
}

export function createDesktopSessionController(
  overrides: Partial<DesktopSessionControllerDependencies> = {},
): DesktopSessionController {
  return createSessionControllerAssembly(
    resolveDesktopSessionControllerDependencies(overrides),
  );
}

let desktopSessionController: DesktopSessionController | null = null;

export function getDesktopSessionController(): DesktopSessionController {
  if (!desktopSessionController) {
    desktopSessionController = createDesktopSessionController();
  }

  return desktopSessionController;
}

export function resetDesktopSessionController(): void {
  desktopSessionController = null;
}
