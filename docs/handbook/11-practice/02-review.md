# Chapter 20 — Code Review Training

*Part V · Reference*

---

Reviewing code is a skill with its own ladder: spotting what the compiler catches, up through judging what the compiler cannot. This chapter is a seven-level curriculum. Each level gives exercises first; **all solutions are gathered at the end of the chapter**, after the separator, so levels can be attempted honestly. The progression uses this repository's real files — open each alongside the exercise.

## Level 1 — Syntax and the compiler

**Goal**: trust the tools, understand what they say, fix what they name.

**Exercise 1.1.** `cd web && npx tsc --noEmit` on a clean tree. Then introduce this into any scratch file and re-run:

```ts
const track: Track = { id: "x", title: 4 };
```

Write down the error verbatim and identify: the *expected* type, the *received* type, and which one the fix changes.

**Exercise 1.2.** Introduce a missing closing brace into a small component. Compare the compiler's reported location with the actual mistake, and state the rule of thumb for brace errors (where does the compiler point?).

**Exercise 1.3.** Run the linter over a scratch file containing `var x = 1;`. Read the rule name it cites and follow it to its documentation. Why is `var` banned here?

## Level 2 — Explaining a function

**Goal**: read a function and state its contract — inputs, outputs, one surprising fact.

**Exercise 2.1.** `formatDuration` (`web/src/lib/formatters.ts`). Write its contract as a comment: parameters, return, and the one input class it treats specially. Verify against `web/src/__tests__/formatters.test.ts`.

**Exercise 2.2.** `cn()` (`web/src/lib/utils.ts`). Explain in two sentences why it exists when template strings could join classes. (Chapter 11.3 has the ingredients; the answer involves class *conflicts*.)

**Exercise 2.3.** `_file_id()` (`api/app/services/metadata_service.py`). State what it takes, what it returns, and — the point of the exercise — write the one-sentence warning that belongs above it in the file.

## Level 3 — Finding obvious bugs

**Goal**: given code that compiles, find what is wrong at runtime.

**Exercise 3.1.**

```ts
function totalDuration(tracks: Track[]): number {
  let total;
  for (const t of tracks) total += t.duration;
  return total;
}
```

**Exercise 3.2.**

```ts
useEffect(() => {
  fetchResults(query).then(setResults);
}, []);
```

**Exercise 3.3.**

```python
async def count_liked(tracks: list[dict]) -> int:
    count = 0
    for t in tracks:
        if t["is_liked"]:
            count += 1
        await asyncio.sleep(0)   # yield to the loop
    return count
```

## Level 4 — Finding bad patterns

**Goal**: code that works but will hurt. Name the pattern, cite the chapter, propose the replacement.

**Exercise 4.1.**

```ts
const copy = [...queue];
copy.sort((a, b) => a.title.localeCompare(b.title));
const shuffled = [...copy].sort(() => Math.random() - 0.5);
```

**Exercise 4.2.**

```python
def read_playlists():
    with open(MUSIC_DIR / ".playlists.json") as f:
        return json.load(f)
```

**Exercise 4.3.**

```tsx
const [isLoading, isLoaded, hasError] = useFetch();
{!isLoading && !hasError && <List data={data} />}
{isLoaded && hasError && <Error />}
```

## Level 5 — Reviewing a small feature

**Goal**: review a complete, self-contained change as a reviewer would.

Take the diff of any small real commit (`git log --oneline --stat`, pick one touching ≤3 files; `git show <hash>`). Produce a written review with: one-paragraph summary in your own words; one correctness question you'd ask the author; one test you'd request; one approval-blocker or "approve with comments" verdict. Apply 20.6's checklist before finalizing.

## Level 6 — Reviewing a real project change

**Goal**: review a change with blast radius, using the project's own risk map.

Pick a commit touching one of the "critical files" listed in `CLAUDE.md` (stream router, player hook, queue store, download service). Trace three things: every *caller* of what changed (`grep`), every *cache* it could invalidate (10.5), and every *test* that pins the behavior (16.3/16.4). Write the review: what the change risks, what protects it, what's missing.

## Level 7 — A full pull-request review

**Goal**: the whole artifact, as it would face a maintainer.

Take any merged PR from the repository's history (GitHub's PR list). Review end to end: the description (problem, approach, verification — 14.9's standard); the commit sequence (14.3's units); the diff (Levels 3–4 eyes); the tests (did they pin the *promise* or just the code?); the docs (does `CLAUDE.md` or a chapter need to move?). Deliver the artifact a real review ends with: verdict, blocking findings, non-blocking suggestions, and one thing the PR taught you about the codebase.

## Checklist — the reviewer's questions

Before any verdict, the list this chapter's levels compile:

1. Does it do what the name says? (2.x)
2. Does every boundary guard absence? (19.2)
3. Is async work independent-and-parallel, or accidentally serialized? (19.3)
4. Does React state mutate or replace? Do dependencies match usage? (19.4)
5. Does the backend validate at the door and delegate beyond it? (19.6)
6. Do writers invalidate what they make stale? (19.6, 10.5)
7. Does the test pin a sentence, or just exercise code? (19.8)
8. What does this change make *harder* to remove later?

---

*Solutions*

**1.1** The compiler reports the `title` mismatch: expected `string`, received `number`. The fix changes the *value*, not the type — the annotation already stated the contract. The general lesson: compiler errors name two sides, and the fix belongs to whichever side is wrong about intent.

**1.2** The compiler points *after* the mistake — usually the following declaration or EOF — because a missing closer makes everything after it parse as inside the block. Rule of thumb: for brace errors, look *above* the reported line.

**1.3** `no-var`: `var` is function-scoped and hoisted, so it can be read before its line and leaks out of blocks; `let`/`const` are block-scoped and temporal-dead-zone protected. The rule exists to make scoping visible.

**2.1** Contract: `(seconds: number) → string` in `m:ss`, or `h:mm:ss` when hours are present; the special class is non-finite/negative input, guarded to `"0:00"`. The tests pin both branches — contract and tests should be readable as one document.

**2.2** `cn()` joins class strings *and resolves Tailwind conflicts* via `tailwind-merge` — later classes win over earlier conflicting ones (`"px-2 px-4"` → `px-4`), which raw template strings cannot do. It exists so component overrides compose predictably.

**2.3** Takes an absolute path, returns `MD5(path)[:16]` — and that string **is** the identity of every local track in stream URLs, likes, history, and playlists. The warning: *do not change the output or the input encoding; every stored ID in every sidecar and cache breaks silently.*

**3.1** `total` is `undefined` (no initializer), so the first `+=` yields `NaN` — the function returns `NaN` for every input. Fix: `let total = 0`. Class: logic error (1.5), invisible until a NaN reaches a renderer.

**3.2** Two bugs. The empty dependency array means the effect runs once with the *initial* (empty) `query` and never again — searches do nothing. And if `query` were added, the missing cancellation flag lets stale responses overwrite fresh ones (7.4's skeleton is the fix for both).

**3.3** It works, but the `sleep(0)` inside a CPU-only loop is cargo cult: this function does no I/O, so yielding adds overhead and protects nothing. The hazard the pattern exists for (blocking the loop during *real* I/O) is absent here. The reviewer's question is always "what does this await *protect*?"

**4.1** `Math.random() - 0.5` is not a shuffle — it is biased and sorter-dependent. Use Fisher–Yates (`shuffle()` in `web/src/lib/utils.ts` exists and is tested). The copy-before-sort part is *correct* (19.1's check) — the review comment should say so, not paint the whole snippet red.

**4.2** Missing `encoding="utf-8"` on platforms where the default differs, no error handling for a missing/corrupt file (first run, before the file exists), and the dict returned unvalidated (19.6's validate-at-the-door). Fix: encoding, a `FileNotFoundError → {}` guard, and parse-through-Pydantic if the shape matters.

**4.3** Three booleans that must mutually exclude — the discriminated-union smell (19.5). `{status: "loading" | "loaded" | "error"}` makes the impossible state unrepresentable, and the render becomes a switch with every state visible.

**Level 5–7**: open-ended by design — the check for these is the checklist above. A review that used the checklist and still approved something broken is the exception that proves the list's value: find which question was skipped.
