---
summary: Defines the local Chrome-extension UI preview, its mocked runtime boundary, and required verification after UI changes.
read_when:
  - changing extension popup, content, history, options, or install UI
  - debugging extension components outside the browser-extension runtime
---

# Extension Preview

Run from the repository root:

```bash
bun run preview:chrome
```

The preview serves `apps/extension/preview.html` with mocked extension APIs. It covers popup and
content states, Product history, the options shell, and the install shell without rebuilding and
reloading the installed extension.

When a previewed component starts using another extension API, extend the preview runtime shim.
After UI changes, verify the affected states render and the console has no extension-runtime or
asset errors.

Preview data is local and mocked. It does not prove background scripts, content-script injection,
permissions, or live browser integration.
