# Chapter 21 — Practice Tasks

*Part V · Reference*

---

Graded tasks on the real repository. Each is small enough to finish in one sitting, real enough to matter, and checkable — every task states how to verify it. Work in a scratch branch (17.1); the gates (16.5) are the grader. Solutions are not given: the *verification* is the solution.

## Beginner — first contact

**B1 — Find the feature.** Without running anything, locate where "shuffle" is implemented: the store action, the hook that exposes it, and the button that triggers it. Deliverable: three file paths and one sentence each. *Skill: 8.7's search algorithm.*

**B2 — Trace a request.** Follow one play of a downloaded track from tap to audio, writing the layer at each step (component → hook → api → router → service → stream route). Deliverable: the chain on paper, then confirm each hop in the code. *Skill: 8.4.*

**B3 — Read a test.** Open `web/src/__tests__/formatters.test.ts` and, for each `it`, write the one-line promise it pins. Then run the suite (`npx vitest run`) and confirm every promise holds. *Skill: 16.2.*

**B4 — The version tour.** Find all five version surfaces (17.9's list) and confirm they agree. Then check the tag list (`git tag -l`) against the changelog's latest entry. Deliverable: a yes/no with evidence. *Skill: 14.8.*

**B5 — Run the stack.** Boot backend and frontend (18.1's local row), confirm `/api/health` responds, and note what the health body reports about the music directory. Deliverable: the JSON, and which cron jobs it claims are scheduled. *Skill: 13.6, 18.7.*

## Beginner — small changes

**B6 — A label change.** Change one user-visible string (an empty-state message) in a page, run the gates, and commit with a Conventional Commit message. Deliverable: the commit, and the gate output. *Skill: 14.3.*

**B7 — A test first.** Pick any pure function in `lib/` with an untested guard branch; write the failing test first (16.6's step 5), then confirm it fails, then confirm the current code already passes it — and explain which of the two outcomes means the guard is untested today. *Skill: 16.6.*

**B8 — A skeleton row.** Add a loading-skeleton row component and wire it into one page's loading state (7.12). Deliverable: the component, the page diff, four-state table for that page before and after. *Skill: 17.3.*

**B9 — Environment arithmetic.** Change `MUSIC_DIR` in a scratch `.env` to a temp directory, boot the backend, and confirm the library is empty and `/api/health` reports the new path. Revert. Deliverable: one paragraph on what read that variable and when. *Skill: 3.7.*

## Intermediate — real features

**I1 — A new utility with tests.** Add `formatRelativeTime(ts: number): string` ("3m ago", "2h ago", "May 12") to `lib/formatters.ts` with a full Vitest suite including boundary cases (just now, future input, invalid input). Deliverable: implementation + tests, gates green. *Skill: 17.3 + 16.6.*

**I2 — A read-only endpoint.** Follow 17.5 end to end: a service function, a route with `response_model` and the correct access class per 9.9, an inventory-test entry, OpenAPI regeneration, a typed frontend wrapper, and one backend test. Suggested: `GET /api/meta/build-info` returning version and uptime. *Skill: the full vertical slice.*

**I3 — A store field.** Add a persisted `playbackRate` (0.5–2.0) to the player store: state, action with clamping, persistence, a settings row that uses it, and application of the rate to the audio engine. Deliverable: the diff and a note on which consumers had to change. *Skill: 8.3's ownership rule.*

**I4 — A page state.** Find a page whose empty state is a bare "Nothing here" and upgrade it: message, illustration or icon, and a call-to-action button that navigates somewhere useful. Deliverable: before/after screenshots (or descriptions) and the four-state table. *Skill: 7.12.*

**I5 — The invalidation drill.** In a scratch branch, comment out one of the two invalidation calls in the download pipeline and observe which test fails. Restore, then write one sentence on why the *other* cache's test did not catch it. Deliverable: the failing test name and the sentence. *Skill: 10.5.*

**I6 — A pattern entry.** Add one entry to Chapter 19's catalogue for a shape you found in the code that it misses, in the chapter's exact format (shape, means, check). Deliverable: the markdown, reviewed against 19.1's standards. *Skill: 19.0 — pattern extraction.*

**I7 — Bug hunt, bounded.** Pick one page. Audit it against the Chapter 20 checklist and file every finding as a numbered list with severity. Do not fix; deliver the list. (Fixing is the next task.) *Skill: 20.5.*

**I8 — Fix from your own audit.** Take I7's highest-severity finding and fix it with a test that pins the fix. Deliverable: branch, fix, test, gates, and the PR body per 14.9. *Skill: the whole handbook.*

## Intermediate — systems

**S1 — The offline path.** With the dev server stopped, load the PWA build and map what still works (cached shell, cached audio, artwork) versus what degrades. Deliverable: a table of ten actions and their offline behavior, explained by 12.5's strategies. *Skill: 12.5.*

**S2 — The Doctor's checklist.** Run through the diagnostics surface against a deliberately broken config (wrong `MUSIC_DIR` in scratch env). Deliverable: what the Doctor reports, what it misses, and one proposed check — written as an issue, not a PR. *Skill: 18.7.*

**S3 — Release rehearsal.** Perform 17.9's sequence in a scratch clone with a fake phase number: bump, changelog, merge, tag, verify — then delete the tag and branch. Deliverable: the command log, annotated with anything the sequence made you look up. *Skill: 17.9.*

## Working through the list

Order matters more than count: B1–B5 establish navigation; B6–B9 establish the change loop; the I-tasks each exercise one full vertical slice. Two habits to keep from the first task onward: every task starts from a clean branch, and every task ends with the gates — the repetition *is* the training. When a task's verification surprises, the surprise is the lesson; write it down where the next contributor will find it.
