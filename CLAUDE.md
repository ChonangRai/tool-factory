# ToolFactory

npm workspaces: `packages/*` and `packages/factories/*`.

| Path | What |
| --- | --- |
| `packages/factories/form-factory` | Form Factory (Supabase-backed) |
| `packages/factories/pdf-factory` | PDF Factory (client-only) |
| `packages/homepage` | Landing site |
| `packages/{api,auth,core,ui}` | Empty placeholders — nothing to read there |

Dev: `npm run dev:form`, `npm run dev:pdf`, `npm run dev:home`.

## Form Factory

React + Vite + TypeScript on Supabase (Auth, Postgres, RLS, Storage, Edge Functions).

- Tenancy is `organizations` + `user_organization_roles`.
- Frontend role checks are UX only. **RLS and RPC authorization are the real boundary.**
- An ordinary tenant role must never become a platform-global role.
- Public submissions/uploads use capability/ticket patterns.
- Storage is private; authenticated downloads use signed URLs.
- Service-role credentials never enter browser code.

## PDF Factory

Fully client-side. No backend, no Supabase. **Files must not leave the browser.**

- `pdf-lib` + `pdfjs-dist` for normal tooling.
- `@cantoo/pdf-lib` is lazy-loaded by the Protect route only.
- Live: workspace tools, PDF↔Image, Compress, Protect.
- Compress: conservative structural optimisation, plus raster re-encode only for confidently-detected scan pages; never returns a larger file.
- Protect: real AES-256.
- Preserve the client-local privacy model unless explicitly told otherwise.

## Database / migrations

- Forward-only. Do not rewrite old migrations casually.
- Inspect effective `pg_policies`, functions and grants — never trust filenames.
- The normal migration path must pass `supabase db reset`.
- Never run `migration repair` blindly; first prove the intended effects already exist.

## Security invariants

- No cross-tenant access.
- Every tenant-owned operation authorizes against the target row's organization.
- Fail closed when ownership is missing.
- No public bucket or public read access.
- No arbitrary client-supplied ownership metadata.
- `SECURITY DEFINER` functions need narrow grants and explicit authorization.
- Avoid `is_admin()` for tenant authorization.
- No raw user-controlled HTML in emails.
- Anonymous capabilities are scoped, expiring, and single-use where appropriate.

## Environment safety

Before any staging/production write, print and check: intended environment, linked Supabase project ref, branch + HEAD, `git status`. **Stop on any mismatch.**

- Form Factory production Supabase ref: `msusfhcupmkxzpgzddtc`.
- Do not infer that any other project is staging or production without explicit confirmation.

## Git / deployment

- A local commit is not deployed. Verify the exact commit is on `origin/main`, then verify the live bundle.
- Keep release commits focused; never sweep in unrelated scratch files from either factory.
- Deploy the frontend only after the backend contract is ready.
- Prefer fail-closed behaviour across mixed versions.

## Validation defaults

For the affected package: typecheck, lint, production build, targeted real-flow tests.

- Supabase/security changes: exercise real local Supabase HTTP/REST/Storage boundaries, and inspect effective policies/grants/functions after migrating.
- PDF Factory: verify there is no file-content network egress.

## Working style

Experienced user — skip tooling explanations. Inspect narrowly, implement first, avoid broad refactors, and preserve existing architecture unless asked to change it.

Report only the delta: **files changed · fix/feature · validation · blockers.** Under ~300 words unless something failed.
