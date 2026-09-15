---
name: Generated client DOM iterable support
description: The generated API client may use Headers.entries during workspace typechecking.
---

The shared API client TypeScript project must include both `dom` and `dom.iterable` in its `lib` compiler setting because Orval-generated request helpers call `Headers.entries()`.

**Why:** The generated client otherwise fails the library typecheck even though the browser API is available at runtime, and the failure can obscure whether newly generated hooks are valid.

**How to apply:** If generated client typechecking reports `Headers.entries` missing, check the client package `lib` list before changing generated source.