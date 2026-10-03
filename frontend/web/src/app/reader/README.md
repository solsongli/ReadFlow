# Reader host boundary

`frontend/web` no longer owns Reader UI, hooks, PDF helpers, or annotations. Their
implementation lives in `@retainpdf/reader`; this directory only contains the
RetainPDF host integration needed by the MPA.

## Startup order

`entry.tsx` deliberately performs these steps in order:

1. import `./adapters/retainpdf.js`, which registers the app-specific ports via
   `@retainpdf/reader/adapters`;
2. call `bootReader()` from `@retainpdf/reader/boot`.

## Files kept here

- `external.ts` adapts existing `frontend/web` APIs and shared Reader ports.
- `adapters/retainpdf.ts` assembles and registers that adapter object.
- `entry.tsx` is the MPA entry point and explicitly boots the package.

Production code uses the package's explicit adapters, boot, contracts and runtime/* exports.
The close-message protocol is re-exported through contracts; no source deep imports are permitted.
The five host adapter modules remain ai.ts, config.ts, content.ts, data.ts and state.ts.
