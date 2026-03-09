# Task Spec Template

Use this template for any non-trivial implementation task. The goal is to give human contributors and AI agents the same decision-complete source of truth.

## Title

Short, behavior-focused task title.

## Goal

One paragraph describing the change and why it matters.

## Current Behavior

- What exists today.
- What is stubbed, mocked, or missing.
- Relevant file or module references.

## Target Behavior

- What must be true after the change.
- What must remain unchanged.

## Constraints

- Security constraints
- Performance or latency constraints
- Architecture constraints
- Dependency constraints

## Contracts / Interfaces

- Shared types, DTOs, IPC channels, runtime events, or docs that change
- If none, state `None`

## Affected Modules

- List only the modules expected to change
- Include new files to create

## Tests

- Failing tests to add first when practical
- Existing tests to update
- Smallest relevant verification commands

## Acceptance Criteria

- Flat checklist of observable outcomes

## Out Of Scope

- Related work that will not be done in this task

## Rollout / Verification Notes

- Manual validation notes
- Migration notes
- Fallback plan if relevant
