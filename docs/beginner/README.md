# Rheoson Beginner Documentation — Start Here

Welcome. This folder is a complete onboarding course built around **this repository** — not a generic tutorial. Work through it in order and you will end up able to read this codebase, fix bugs, review pull requests, and take real development tasks.

Rheoson itself: a self-hosted music streaming and download app. A **Python backend** (FastAPI) serves audio and metadata, a **React frontend** plays it, and a **Capacitor shell** wraps the frontend into an Android app. If you have never programmed before, start at [00](00-start-here/what-is-programming.md) and just keep going.

## The recommended learning order

| Stage | Folder | What you'll be able to do afterwards |
|---|---|---|
| 0 | [00-start-here](00-start-here/what-is-programming.md) | Understand what code, files, and programs actually are |
| 1 | [01-programming-basics](01-programming-basics/variables-functions-data.md) | Read simple code: variables, functions, conditions, loops |
| 2 | [02-javascript](02-javascript/fundamentals.md) | Read the frontend's language patterns |
| 3 | [03-typescript](03-typescript/types-in-practice.md) | Understand the types that make this codebase safe |
| 4 | [04-react](04-react/components-and-state.md) | Understand every screen in `web/src/pages` |
| 5 | [05-codebase](05-codebase/architecture.md) | Navigate the whole repository without getting lost |
| 6 | [06-backend](06-backend/api-guide.md) | Understand every API route and how to call it |
| 7 | [07-database](07-database/mongodb.md) | Understand where user data lives |
| 8 | [08-dependencies](08-dependencies/stack.md) | Know what every library in `package.json` is for |
| 9 | [09-terminal](09-terminal/linux-basics.md) | Work comfortably in a terminal |
| 10 | [10-git](10-git/git-and-github.md) | Commit, branch, and open pull requests like the project does |
| 11 | [11-debugging](11-debugging/practical-debugging.md) | Diagnose errors instead of fearing them |
| 12 | [12-testing](12-testing/how-testing-works.md) | Run, read, and write the project's tests |
| 13 | [13-infrastructure](13-infrastructure/deployment.md) | Understand how the app reaches real devices |
| 14 | [14-how-to](14-how-to/recipes.md) | Copy-paste recipes for the most common changes |
| 15 | [15-code-patterns](15-code-patterns/patterns.md) | Recognize the code shapes used everywhere here |
| 16 | [16-code-review](16-code-review/curriculum.md) | Do graded review exercises, from typos to full PRs |
| 17 | [17-practice](17-practice/tasks.md) | Take real starter tasks on this codebase |
| 18 | [18-glossary](18-glossary/glossary.md) | Look up any term instantly |
| 19 | [19-official-docs](19-official-docs/index.md) | Jump to the official documentation for every tool |

## How to use this course

1. **One folder per sitting.** Each document ends with small exercises — do them, don't skip them.
2. **Keep the app running while you learn.** The fastest way to connect code to behavior:
   ```bash
   # terminal 1 — backend
   cd api && uv run uvicorn app.main:socket_app --reload
   # terminal 2 — frontend
   cd web && npm run dev
   ```
   Then open http://localhost:3000. Every concept you read about is visible in that app.
3. **When stuck on a word**, check the [glossary](18-glossary/glossary.md).
4. **When you break something** (you will — that's good), [11-debugging](11-debugging/practical-debugging.md) shows you how to find out why.

## The three rules of this repository

These come from [CONTRIBUTING.md](../CONTRIBUTING.md) and matter from day one:

- **Tests travel with changes.** A bug fix ships with the test that proves it.
- **Docs update with behavior.** If you change an endpoint, the doc that owns it changes too.
- **Quality gates are binary.** `pytest`, `tsc`, `eslint`, and the production build either pass or the change doesn't land.

## What exists where (30-second map)

```
api/     → Python backend. Routes, services, tests.        (06, 07, 12)
web/     → React frontend. Pages, components, stores.      (02–04, 08)
web/android/ → Android project produced by Capacitor.      (13)
docs/    → You are here; beginner/ is this course.         (—)
nginx/   → Reverse proxy used in Docker deployments.       (13)
.github/ → CI that builds the APK on every push to main.   (13)
```

Next: [00 — What is programming?](00-start-here/what-is-programming.md)
