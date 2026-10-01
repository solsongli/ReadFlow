Desktop platform runtimes live here.

Layout:

- `shared/fonts/`
- `shared/typst-packages/`
- `windows/python/`
- `windows/typst/`
- `linux/python/`
- `linux/typst/`
- `mac/python/`
- `mac/typst/`

`frontend/desktop/scripts/prepare-app.mjs` reads platform runtimes from this tree.

Linux desktop builds support Ubuntu 22.04 and newer (GLIBC <= 2.35). Build all
Rust binaries and the Python 3.11 runtime on Ubuntu 22.04 or an older compatible
system; copying Python from a newer runner cannot lower its GLIBC requirements.
The Linux release job therefore pins `ubuntu-22.04` instead of `ubuntu-latest`.

Before using a copied Python, run:

```sh
node frontend/desktop/scripts/linux-runtime.mjs --repair-python frontend/desktop/src/runtime/linux/python
```

This replaces builder RUNPATHs with `$ORIGIN` paths and keeps wheel library
directories usable without `LD_LIBRARY_PATH`. `prepare-app.mjs` repeats the
repair after copying/pruning the runtime and checks every backend ELF's GLIBC,
RPATH/RUNPATH and library dependencies. `dist:linux` also checks the complete
Electron package and imports the PDF/AI dependencies using the packaged Python
in isolated mode. Neither check uses host Python or loader search paths.

To check an extracted installation or a relocated package:

```sh
node frontend/desktop/scripts/linux-runtime.mjs \
  --check /path/to/RetainPDF \
  --probe-python /path/to/RetainPDF/resources/backend/python
```

Packaging requires `patchelf` and `binutils` in addition to the existing Linux
dependencies. A GLIBC failure must be fixed by rebuilding the offending native
component on the supported baseline, not by changing version strings in its ELF.

For an offline PDF smoke test, start the extracted desktop with an isolated
`XDG_CONFIG_HOME`, then run its Python (no developer Python required):

```sh
/path/to/RetainPDF/resources/backend/python/bin/python3 -I \
  frontend/desktop/scripts/smoke-linux-translation.py \
  --gateway http://127.0.0.1:40001 --work-dir /tmp/retainpdf-offline-smoke
```

The test uploads a two-page scientific PDF, runs the real command-provider OCR
worker, requests six deterministic translations from a loopback HTTP fixture,
compiles with the bundled Typst, and downloads/verifies the resulting PDF's
Chinese text, inline formula, page geometry and vector diagrams. It uses the
release's default Python transport and synthetic credentials; it does not test
remote provider availability or real model translation quality. Its documents
and synthetic credentials are stored in the isolated test profile.

Exception:

- `frontend/desktop/src/runtime/mac/python/bin/python3` must exist before packaging.
- mac bundles also carry `frontend/desktop/src/runtime/mac/python/Frameworks/Python.framework`
  so packaged `python3` does not depend on a system-level Python.framework.
- The GitHub mac release workflow assembles this runtime on the mac runner.
