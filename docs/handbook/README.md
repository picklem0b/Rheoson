# Rheoson Developer Handbook

A structured introduction to the Rheoson codebase for engineers joining the project.

## About this handbook

Rheoson is a self-hosted music streaming and download application. The frontend is a React single-page application packaged as an Android app with Capacitor; the backend is a Python FastAPI service with a Socket.IO layer; data is split between MongoDB and small on-disk files. Everything in this handbook is drawn from that codebase, and each chapter closes with exercises based on real files in the repository.

The handbook assumes no prior programming experience. The early parts of Part I start with first principles — what a program is, how a file becomes a running process — and the difficulty rises steadily from there. Experienced engineers can skip Part I and Part II and begin with Chapter 8 (Codebase Architecture); a new developer working through every chapter in order should finish able to navigate the repository, run and debug the application, review a pull request, and pick up a first task.

The handbook is organized in five parts:

- **Part I — Foundations** (Chapters 1–3): what programs are, core data and control flow, how the web works.
- **Part II — Languages** (Chapters 4–6): JavaScript and TypeScript as used here, then Python on the backend.
- **Part III — The Codebase** (Chapters 7–12): React, the application architecture, the backend, data, dependencies, and mobile packaging.
- **Part IV — Engineering Practice** (Chapters 13–18): terminal work, Git, debugging, testing, making changes, and the deployment pipeline.
- **Part V — Reference** (Chapters 19–23): pattern recognition, code review training, graded practice tasks, a glossary, and an index of official documentation.

---

## Table of contents

### Part I — Foundations

| Chapter | Title                                                                             | Summary                                                                                  |
| ------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1       | [What a Program Is](01-foundations/01-what-a-program-is.md)                       | Source code, interpreters and compilers, processes, errors, and the life of a request    |
| 2       | [Programming Fundamentals](01-foundations/02-programming-fundamentals.md)         | Values, variables, functions, objects, arrays, conditions, loops, modules, async, errors |
| 3       | [The Web and the Client–Server Model](01-foundations/03-web-and-client-server.md) | HTTP, JSON, URLs, frontends and backends, databases, environment variables, build tools  |

### Part II — Languages

| Chapter | Title                                                    | Summary                                                                     |
| ------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| 4       | [JavaScript Fundamentals](02-languages/04-javascript.md) | Syntax, functions, arrays and objects, destructuring, async, error handling |
| 5       | [TypeScript in Practice](02-languages/05-typescript.md)  | Type annotations, narrowing, unions, generics, interfaces, the compiler     |
| 6       | [Python for the Backend](02-languages/06-python.md)      | Python syntax, typing, async, decorators, Pydantic models as used in `api/` |

### Part III — The Codebase

| Chapter | Title                                                     | Summary                                                                            |
| ------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 7       | [React Fundamentals](03-react/07-react.md)                | Components, props, state, hooks, rendering, composition, routing                   |
| 8       | [Codebase Architecture](04-codebase/08-architecture.md)   | Every directory mapped, the three data stores, how a feature flows end to end      |
| 9       | [The Backend](05-backend/10-backend.md)                   | Routers, services, schemas, the streaming pipeline, WebSockets, background jobs    |
| 10      | [Data: MongoDB and On-Disk Files](06-data/11-data.md)     | Collections, documents, queries, the JSON sidecars, where each kind of state lives |
| 11      | [Dependencies](07-dependencies/12-dependencies.md)        | What every major library does, why it was chosen, and where it is used             |
| 12      | [Mobile: Capacitor and Android](04-codebase/09-mobile.md) | The WebView shell, plugins, the manifest, icons, and the build pipeline            |

### Part IV — Engineering Practice

| Chapter | Title                                                               | Summary                                                                                |
| ------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 13      | [Working in the Terminal](08-tooling/13-terminal.md)                | The core Unix commands, pipes and redirection, processes, repository-specific commands |
| 14      | [Git and GitHub](08-tooling/14-git.md)                              | Commits, branches, merges, rebase, remotes, tags, pull requests, conflicts             |
| 15      | [Debugging](09-quality/15-debugging.md)                             | Reading errors, stack traces, logs, frontend and backend debugging, guided exercises   |
| 16      | [Testing](09-quality/16-testing.md)                                 | What tests are, pytest and Vitest, mocks and fixtures, the repository's suites         |
| 17      | [Making Changes](09-quality/17-making-changes.md)                   | Step-by-step recipes: add an endpoint, add a page, add a store field, ship a release   |
| 18      | [Infrastructure and Deployment](10-operations/18-infrastructure.md) | Environments, CI, Docker, Termux, VPS, Render, the full deployment diagram             |

### Part V — Reference

| Chapter | Title                                                         | Summary                                                                   |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 19      | [Reading Existing Code](11-practice/19-patterns.md)           | A catalogue of the patterns that appear throughout the repository         |
| 20      | [Code Review Training](11-practice/20-review.md)              | A seven-level curriculum from syntax spotting to full pull-request review |
| 21      | [Practice Tasks](11-practice/21-tasks.md)                     | Graded tasks on the real repository, from beginner to intermediate        |
| 22      | [Glossary](reference/22-glossary.md)                          | Every technical term used in the handbook, defined                        |
| 23      | [Official Documentation Index](reference/23-official-docs.md) | Canonical documentation for every technology the project uses             |

---

## Suggested reading paths

**New to programming** — Chapters 1 → 2 → 3 → 4 → 5 → 7, then Chapter 8 and onward in order. Expect the first pass through Chapters 1–3 to take a few days; everything later assumes them.

**Experienced web developer** — Skim Chapters 4–7 for the project's conventions, then read Chapters 8–10 carefully. Those three chapters contain nearly everything specific to this repository. Chapter 17 lists the concrete recipes for common changes.

**Joining to review code** — Chapters 8, 9, 19, and 20, in that order. Chapter 19 maps the recurring shapes in the codebase; Chapter 20 provides graded review exercises with solutions kept separate.

**Preparing a first contribution** — Chapters 13–17, then pick a task from Chapter 21. The repository's contribution rules live in [docs/CONTRIBUTING.md](../CONTRIBUTING.md) and `GIT_WORKFLOW.md` at the repository root; Chapter 14 explains the Git side.

---

## Conventions used in this handbook

**Real code.** Nearly every example is taken from the repository, trimmed to the lines that matter. File paths such as `web/src/hooks/player.hook.ts` appear above snippets so they can be opened alongside the text.

**Concept versus implementation.** Where a chapter teaches a general concept, it says so; where it describes a decision specific to Rheoson, it explains the reasoning. The distinction matters when the codebase changes — concepts age slowly, implementation details quickly.

**Exercises.** Each chapter ends with a short exercise set. Chapter 21 collects larger graded tasks. Solutions to review exercises are kept at the end of their chapter, after a visible separator, so they can be avoided until needed.

**Terminology.** Unfamiliar terms are defined on first use and collected in the [Glossary](reference/22-glossary.md).

---

## Running the application

The handbook refers to a running application throughout, and having one available makes the exercises substantially more useful. The short version, from [docs/DEVELOPMENT.md](../DEVELOPMENT.md): the Vite dev server proxies `/api` and `/socket.io` to the backend at `127.0.0.1:8000`, and Chapter 18 covers the environments beyond local development.
