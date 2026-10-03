# @retainpdf/api

Typed API clients using generated wire DTOs from `@retainpdf/contracts`.

- `library-books.ts` → `fetchLibraryBookList` etc. (from `frontend/web/src/js/api/library-books.ts`)
- `jobs.ts` → `fetchJobPayload` etc.

Build: `npm --prefix frontend/packages/api run build` → `dist/`
Usage: `import { fetchLibraryBookList } from "@retainpdf/api/library-books"`

The explicit package.json exports list is the public contract. Only entry points consumed by the workbench and reader remain.
