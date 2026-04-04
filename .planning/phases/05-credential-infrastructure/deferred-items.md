# Phase 05 Deferred Items

Items discovered during execution but out-of-scope for current plan.

## Pre-existing TypeScript Errors

### auth.ts line 32 — getModel type mismatch

```
src/server/routes/auth.ts(32,38): error TS2345: Argument of type '"claude-haiku-4-5-20251001" | "gpt-4o-mini"' is not assignable to parameter of type 'never'.
```

**Status:** Pre-existing before Plan 05-01 started. Confirmed via `git stash` comparison — error appears on the unmodified file.
**Root cause:** The `getModel(provider, modelId)` signature from `@mariozechner/pi-ai` has stricter second-argument typing than the union literal we pass. Likely the pi-ai type index expects a known ModelId for the given Provider, not an arbitrary string.
**Impact:** Type-check warning only; runtime works (v1.0 shipped with this).
**Scope:** Not caused by credential store refactor. Out of scope for Plan 05-01.
**Recommendation:** Address in a dedicated typing cleanup (either cast `as never` locally or upgrade getTestModel return type to the pi-ai ModelId union).

### setup.ts line 62 — getModel type narrowing (carried from baseline)

```
src/server/agent/setup.ts(62,34): error TS2345: Argument of type 'any' is not assignable to parameter of type 'never'.
```

**Status:** Pre-existing before Plan 05-02 started. The `getModel(provider, modelId as any)` cast was carried over from the original setup.ts (pre-Plan 05). Confirmed via `git stash` — error appears on the unmodified file at HEAD.
**Root cause:** Same as auth.ts:32 — `getModel(provider, modelId)` from `@mariozechner/pi-ai` expects a ModelId literal that depends on the provider; TypeScript cannot narrow the union with the current cast pattern.
**Impact:** Type-check warning only; runtime works.
**Scope:** Not caused by async resolver refactor. Plan 05-02's Task 1 action block explicitly preserved the existing `modelId as any` cast verbatim.
**Recommendation:** Address together with auth.ts:32 in a dedicated typing cleanup pass — either use `as never` or pipe through a provider-indexed lookup.

### models.ts line 20 — getModels KnownProvider type mismatch

```
src/server/routes/models.ts(20,28): error TS2345: Argument of type 'string' is not assignable to parameter of type 'KnownProvider'.
```

**Status:** Pre-existing before Plan 05-01 started. Confirmed via `git stash` — error appears on the unmodified file (with the old `hasCredentials` import, this same error was present).
**Root cause:** The guarded `provider` variable comes from `c.req.query("provider")` (type `string`) while `getModels(provider)` from `@mariozechner/pi-ai` requires a `KnownProvider` literal union. The route narrows via an `.includes` check but TypeScript does not propagate that narrowing to the original `string`. There is also a `typedProvider` cast available on the same line — passing that to `getModels` would fix the error.
**Impact:** Type-check warning only; runtime works (validated by the includes guard above).
**Scope:** Not caused by credential store refactor. Out of scope for Plan 05-01.
**Recommendation:** Change `getModels(provider)` to `getModels(typedProvider)` in a typing cleanup pass.

