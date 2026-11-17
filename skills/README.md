# Skills

The agent skills this project uses, installed from the open registry and committed
here so a fresh checkout carries them without a network call.

Each folder is one skill: `SKILL.md` is the instruction, anything beside it is
reference material the skill links to. Read the one that covers the work before
starting the work; they are short by design.

| Skill | Source | Why it is here |
| --- | --- | --- |
| `apple-design` | emilkowalski/skills | Apple's spacing, type and motion translated for the web. The home screen is built from it. |
| `mobile-native` | emilkowalski/skills | The details that separate a web page from an app on a phone: tap highlight, viewport units, momentum, safe areas. |
| `animation-vocabulary` | emilkowalski/skills | Names for motion, so a transition can be described and judged rather than "make it smooth". |
| `gestures` | emilkowalski/skills | Drag, swipe and sheet feel, including when not to add a gesture. |
| `frontend-design` | anthropics/skills | Layout, hierarchy and type choices for screens that have to look intentional. |
| `design-system` | nextlevelbuilder/ui-ux-pro-max-skill | Tokens, scales and component consistency. |
| `tailwind-css-patterns` | giuseppe-trisciuoglio/developer-kit | Tailwind v4 patterns, which is what this repo uses. |
| `vercel-react-best-practices` | vercel-labs/agent-skills | React rendering and data-fetching correctness, especially the re-render rules the player depends on. |
| `typescript-advanced-types` | wshobson/agents | The shared contracts are zod schemas with inferred types; this keeps them honest. |
| `workers-best-practices` | cloudflare/skills | The API runs on Workers: bindings, limits, streaming. |
| `supabase-postgres-best-practices` | supabase/agent-skills | Postgres schema and query practice for the Neon database. |
| `playwright-best-practices` | currents-dev/playwright-best-practices-skill | Browser verification that proves a screen works instead of assuming it. |
| `accessibility` | addyosmani/web-quality-skills | Focus order, keyboard paths, contrast and the mobile traps. |
| `security-review` | getsentry/skills | Auth, tokens, input handling and what not to log. |
| `code-review` | mattpocock/skills | How to review a change before it lands. |
| `documentation-and-adrs` | addyosmani/agent-skills | Decision records in `docs/`, which is where this repo already keeps its thinking. |

Deliberately not installed: React Native and Expo skills (there is no native
build), payment and CMS skills (nothing here sells or publishes), and image
generation (the app has no artwork of its own).

## Adding one

```
npx skills find <query>
npx skills add <owner/repo@skill> -y
```

Then move the folder from `.agents/skills/` into `skills/` and add a row above.
`skills-lock.json` records the source commit and hash for each installed skill.
