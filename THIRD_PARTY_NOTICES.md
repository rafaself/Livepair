# THIRD_PARTY_NOTICES

This file lists the main directly used runtime libraries for `apps/api` and `apps/desktop`, based on the workspace manifests, `pnpm-lock.yaml`, and installed package metadata under `node_modules`.

It is intentionally limited to direct runtime libraries and the desktop runtime platform (`electron`). Dev/build/test tooling and the full transitive dependency tree are not enumerated here. `packages/shared-types` does not declare any third-party runtime dependencies.

## Included notices

- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` (`apps/api`) — MIT. Copyright (c) 2017-2024 Kamil Mysliwiec <https://kamilmysliwiec.com>
- `class-transformer`, `class-validator` (`apps/api`) — MIT. Copyright (c) 2015-2020 TypeStack
- `dotenv` (`apps/api`, `apps/desktop`) — BSD-2-Clause. Copyright (c) 2015, Scott Motte
- `pg` (`apps/api`) — MIT. Copyright (c) 2010 - 2021 Brian Carlson
- `prom-client`, `reflect-metadata`, `rxjs` (`apps/api`) — Apache-2.0. No separate `NOTICE` file was present in the installed package metadata reviewed for this repository.
- `electron` (`apps/desktop`, directly imported by main/preload code) — MIT. Copyright (c) Electron contributors; Copyright (c) 2013-2020 GitHub Inc.
- `@google/genai` (`apps/desktop`) — Apache-2.0. No separate `NOTICE` file was present in the installed package metadata reviewed for this repository.
- `lucide-react` (`apps/desktop`) — ISC. Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
- `react`, `react-dom` (`apps/desktop`) — MIT. Copyright (c) Facebook, Inc. and its affiliates.
- `react-markdown` (`apps/desktop`) — MIT. Copyright (c) Espen Hovlandsdal
- `remark-gfm` (`apps/desktop`) — MIT. Copyright (c) Titus Wormer <tituswormer@gmail.com>
- `zustand` (`apps/desktop`) — MIT. Copyright (c) 2019 Paul Henschel

## Needs review

- None.
