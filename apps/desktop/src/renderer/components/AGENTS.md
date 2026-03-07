# Component Architecture

## Layer Hierarchy

```
primitives/   → atoms: no business logic, no side effects, no imports from other layers
layout/       → structural shells: spacing, positioning, and composition only
composite/    → assembled from primitives + layout; may hold local UI state
features/     → domain-aware; may access window.bridge, hold async state, drive side effects
```

Dependency rule: each layer may only import from layers above it in the list.
`features` → `composite` → `layout` → `primitives`
No upward imports. No cross-layer skips.

## File Conventions

Every component lives in its own file pair:

```
ComponentName.tsx    ← React component + exported TypeScript type
ComponentName.css    ← co-located styles, BEM naming, token-only values
```

The `.tsx` file imports its own `.css` directly:
```ts
import './ComponentName.css';
```

No shared or global component CSS files. No CSS modules. No styled-components.

## TypeScript Rules

- Export a named type `ComponentNameProps` alongside every component.
- Extend the relevant HTML attributes type when the component wraps an HTML element:
  ```ts
  type ButtonProps = { variant?: 'primary' } & ButtonHTMLAttributes<HTMLButtonElement>;
  ```
- Spread `...rest` onto the root element so callers can pass `className`, `id`, event handlers, etc.
- Never use `any`. Never use non-null assertion (`!`) unless the value is guaranteed non-null by structure.

## CSS Rules

- **Tokens only** — every value must reference a CSS variable from `styles/tokens.css` or `styles/motion.css`. No raw hex, no unitless magic numbers, no hardcoded px values except where the spec calls for a fixed size not covered by a token (e.g. `16px` for an icon dot).
- **BEM naming** — block is the component name in kebab-case: `.btn`, `.icon-btn`, `.panel-header`.
  - Element: `.panel-header__title`
  - Modifier: `.btn--primary`, `.btn--sm`
- **No nesting** — flat selectors only. Exception: `:hover`, `:focus-visible`, `:disabled`, `@keyframes`, `@media` are fine.
- **Motion** — all transitions use `var(--motion-*)` for duration and `var(--ease-out)` for easing. Honor `prefers-reduced-motion` (handled globally in `motion.css`).
- **Focus** — every interactive element must have a `:focus-visible` outline using `var(--color-accent)`.

## Accessibility Rules

- Buttons must have a meaningful accessible name (`aria-label` or visible text child).
- Icon-only buttons use `IconButton` with a required `label` prop — never use `Button` without text.
- Use semantic HTML: `<header>`, `<footer>`, `<aside>`, `<section>`, `<nav>` where appropriate.
- Dialog/modal: `role="dialog"`, `aria-modal="true"`, `aria-label`, Escape key closes.
- Status indicators: `role="status"`, `aria-label` describes the current state.
- Toggle buttons: `aria-expanded` and `aria-controls` when they show/hide a region.

## Props Guidelines

- Primitives: minimal, generic props. No domain concepts (no `session`, `gemini`, `user`, etc.).
- Layout: only structural props (`isOpen`, `position`, `title`). No data or callbacks that imply domain logic.
- Composite: may accept domain-adjacent state (e.g. `ConnectionState`) but no async ops.
- Features: own async lifecycle and bridge calls. Do not leak loading/error state into layout or primitive props.

## Barrel Exports

Each folder has an `index.ts` that re-exports all public components and types. Import from the folder, not from individual files, unless you are inside the same folder:

```ts
// From outside:
import { Button, Card } from '../primitives';

// From inside primitives/:
import './Button.css';  // direct file import for co-located assets only
```

The top-level `components/index.ts` re-exports all sub-barrels.

## Do Not

- Do not add business logic (API calls, IPC, timers) to `primitives` or `layout` components.
- Do not import from `features` inside `composite`, `layout`, or `primitives`.
- Do not use inline `style={{}}` for anything covered by a design token. Use a CSS class.
- Do not create a new component to wrap a single HTML element with no meaningful abstraction.
- Do not duplicate token values — if you need a value not in `tokens.css`, add it there first.
