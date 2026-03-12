---
name: create-pull-request
description: Push the current branch and open a PR to main with gh.
---

Open a PR for the current task branch.

Rules:
- branch must already be committed
- working tree must be clean
- target branch is `main`
- do not invent validation results

Steps:
1. Check `git status --short` and `git branch --show-current`.
2. Push with `git push -u origin "$(git branch --show-current)"`.
3. Open PR with `gh pr create --base main --head "$(git branch --show-current)" --title "<title>" --body "<body>"`.

Return:
- branch name
- latest commit hash
- PR URL