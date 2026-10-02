# Git Quest

A free browser game that teaches git and GitHub to complete beginners.
Nine chapters, 58 levels, from "what is a terminal?" to rebasing and
pull requests — all inside the browser with no real git needed.

See `docs/SPEC.md` for the design, `docs/ARCHITECTURE.md` for code
structure, and `docs/PROFESSOR_GUIDE.md` for classroom use.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

## Scripts

| Command              | What it does                             |
|----------------------|------------------------------------------|
| `npm run dev`        | Start the Vite dev server                |
| `npm run build`      | Production build to `dist/`              |
| `npm run preview`    | Serve the production build locally       |
| `npm run typecheck`  | TypeScript strict type checking          |
| `npm run lint`       | ESLint                                   |
| `npm test`           | Vitest unit and differential tests       |
| `npm run test:e2e`   | Playwright end-to-end tests              |

## Testing

Unit tests cover the git engine (with differential tests that compare
output against real git), the parser, goal checks, scoring, the
classroom progress store, and the hub.

```bash
npm test                    # all unit tests
npm test -- --run           # single run (no watch)
```

Solution tests verify that every level's reference solution reaches the
win screen headlessly:

```bash
npx vitest run tests/unit/levels/solutions.test.ts
```

## Build and deploy

```bash
npm run build
```

The `dist/` folder is a static site. The GitHub Actions workflow in
`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on
every push to `main`.

## Progress export / import

Player progress is saved in the browser's localStorage. Players can
export their progress as a `.gitquest.json` file from Settings and
import it on another browser or after clearing data. The import
replaces all current progress.

Professors can collect exported files and load them into the Professor
Dashboard (`#/professor`) to see a class summary table with CSV export.

## Tech stack

- Vite + React + TypeScript (strict)
- xterm.js for the terminal
- Vitest + Playwright for testing
- Pure-TypeScript git engine (no real git at runtime)
