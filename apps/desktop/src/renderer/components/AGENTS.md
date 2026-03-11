# Component Architecture

## Layering (Import Direction)

```
primitives/  → leaf UI building blocks (no domain logic, no side effects)
layout/      → structural shells (composition + positioning)
composite/   → composed UI (may hold local UI state)
features/    → domain-aware UI (may call `window.bridge`, start async work)
```

Dependency rule: **lower layers must not import higher layers**.

- `primitives` imports nothing from `layout/`, `composite/`, `features/`
- `layout` may import `primitives`
- `composite` may import `layout` and `primitives`
- `features` may import any component layer

## TypeScript Conventions
- Export a named `ComponentNameProps` for exported components.
- Avoid `any`; avoid non-null assertions (`!`) unless structure guarantees non-null.
- When wrapping an element, extend the corresponding attributes type and pass through `...rest`.

## CSS Conventions
- Prefer tokens from `src/renderer/styles/tokens.css` and `src/renderer/styles/motion.css` for colors/spacing/radius/shadows/motion.
- Use flat selectors and BEM-style class naming (`.btn`, `.btn--primary`, `.panel-header__title`).
- `:focus-visible` must be visible for interactive elements.
- Fixed sizes already use `px` in several primitives (buttons, icon buttons, borders) — keep new hardcoded values intentional and consistent.

## File + Export Conventions
- Keep components small and co-located. If a component needs styles, prefer a nearby `.css` file.
- Feature-level CSS may be shared when multiple closely-related feature components are styled together (e.g. `AssistantPanel.css`).
- Maintain barrel exports via `index.ts` in each layer folder and `components/index.ts` at the top.

## Don’ts
- No side effects (API/IPC/timers) in `primitives/` or `layout/`.
- Don’t import from `features/` inside `primitives/`, `layout/`, or `composite/`.
