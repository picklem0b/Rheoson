# Glossary

*Every term used anywhere in this course, in one place. Cross-references point to the doc that teaches it.*

**API** — Application Programming Interface; the set of requests one program can make of another. Here: the backend's `/api/*` routes. → [00 §6](../00-start-here/what-is-programming.md)
**ASGI** — the Python standard for async web servers/apps; uvicorn serves FastAPI through it.
**Assertion** — a test's pass/fail statement. → [12 §1](../12-testing/how-testing-works.md)
**Async / await** — writing non-blocking code that waits without freezing. → [01 §9](../01-programming-basics/variables-functions-data.md)
**Authentication vs Authorization** — *who you are* (Clerk token) vs *what you may do* (guest matrix). → [06 §5](../06-backend/api-guide.md)
**Backend** — the server-side program (`api/`). → [00 §6](../00-start-here/what-is-programming.md)
**Boolean** — `true`/`false`.
**Branch** — a movable label on the commit chain. → [10 §2](../10-git/git-and-github.md)
**Build** — turning source into shippable files (Vite → `dist/`).
**Cache invalidation** — dropping stored results when their source changes; this repo's classic bug source. → [15 §13](../15-code-patterns/patterns.md)
**Capacitor** — wraps a web app into a native app shell (the APK).
**CI/CD** — Continuous Integration/Delivery: automated test+build on every push (GitHub Actions).
**Client** — the program that sends requests (the frontend). → [00 §6](../00-start-here/what-is-programming.md)
**Collection** — a Mongo "table". → [07 §2](../07-database/mongodb.md)
**Commit** — an immutable snapshot with a message. → [10 §1](../10-git/git-and-github.md)
**Component** — a React function returning UI. → [04 §1](../04-react/components-and-state.md)
**Conventional Commits** — `type(scope): summary` message format used here. → [10 §4](../10-git/git-and-github.md)
**CORS** — which origins a browser permits to call an API; configured in `main.py`.
**CRUD** — Create, Read, Update, Delete — the four data operations.
**Dependency** — a published package your code imports. → [08](../08-dependencies/stack.md)
**Deployment** — putting a build into production. → [13](../13-infrastructure/deployment.md)
**Document (Mongo)** — one JSON-like record. → [07 §2](../07-database/mongodb.md)
**Endpoint** — one URL+method combination of an API.
**Environment variable** — named config from outside the code (`MUSIC_DIR`, `VITE_API_URL`). → [00 §8](../00-start-here/what-is-programming.md)
**FastAPI** — the backend framework. → [06](../06-backend/api-guide.md)
**Fixture** — reusable test setup. → [12 §1](../12-testing/how-testing-works.md)
**Frontend** — the UI program (`web/`). → [00 §6](../00-start-here/what-is-programming.md)
**Generics** — types with a placeholder (`api.get<T>`). → [02 §8](../02-javascript/fundamentals.md)
**Git** — version control. → [10](../10-git/git-and-github.md)
**Hook** — React's stateful-logic primitive (`useState`); custom hooks reuse logic. → [04 §4–5](../04-react/components-and-state.md)
**HTTP** — the request/response protocol of the web. → [06 §2](../06-backend/api-guide.md)
**JSON** — text format for structured data; the API's language.
**JWT** — the token format Clerk issues; verified by the backend.
**Lint** — automated style/error checking (eslint, ruff).
**Middleware** — code that runs around a request (auth deps, CORS).
**Mock** — a test stand-in for an external system. → [12 §5](../12-testing/how-testing-works.md)
**MongoDB** — the document database. → [07](../07-database/mongodb.md)
**Module** — one importable file. → [01 §7](../01-programming-basics/variables-functions-data.md)
**Node.js** — the JavaScript runtime npm packages and Vite run on.
**OpenAPI** — the machine-readable API contract; snapshot exported and type-generated from. → [03 §1](../03-typescript/types-in-practice.md)
**Package** — a published, versioned bundle of code.
**Parameter** — a function's named input. → [01 §2](../01-programming-basics/variables-functions-data.md)
**Promise** — a "value later" object; `await` unwraps it. → [02 §10](../02-javascript/fundamentals.md)
**Prop** — a component input. → [04 §2](../04-react/components-and-state.md)
**Pydantic** — typed models/validation behind every backend schema. → [15 §11](../15-code-patterns/patterns.md)
**Range request** — `Range: bytes=…` HTTP header; how seeking works. → [06 §4](../06-backend/api-guide.md)
**Repository** — one project under git. → [10 §1](../10-git/git-and-github.md)
**Router** — URL→code mapping (frontend: react-router; backend: FastAPI routers).
**Runtime** — when the program actually runs (vs compile time, when types are checked).
**Schema** — a declared data shape.
**Service worker** — browser-side proxy enabling offline caching (Workbox/PWA). → [13 §4](../13-infrastructure/deployment.md)
**Socket.IO** — the WebSocket layer carrying download progress. → [06 §7](../06-backend/api-guide.md)
**State** — data that changes over time and drives the UI. → [04 §3](../04-react/components-and-state.md)
**Store (Zustand)** — app-wide state container. → [04 §7](../04-react/components-and-state.md)
**Tag (git)** — a named pointer to a commit; here: annotated releases `v2.MILESTONE.PHASE`. → [10 §4](../10-git/git-and-github.md)
**Transpiler** — source-to-source compiler (TS→JS, JSX→JS).
**TypeScript** — JavaScript plus a checked type layer. → [03](../03-typescript/types-in-practice.md)
**Union type** — "exactly one of these" (`'done' | 'error'`). → [02 §9](../02-javascript/fundamentals.md)
**uvicorn** — the backend's server process.
**Webhook** — an API call *to you* when something happens elsewhere (Clerk events).
**WebSocket** — a persistent two-way connection (progress pushing).
**Working tree** — your current, uncommitted files. → [10 §1](../10-git/git-and-github.md)
**yt-dlp** — the YouTube extraction/download engine doing the heavy lifting.
**Zustand** — the state library. → [04 §7](../04-react/components-and-state.md)
