# Wave A P01 feasibility report

**Status:** In progress; local implementation checks and live Supabase proof recorded. Render runtime evidence remains pending.
**Scope:** Synthetic fixtures only, fake AI only, no production data.
**Target:** Render Free web service plus Supabase Free database/Auth/Storage.

## Decision under test

Determine whether Mirai's pinned production runtime, private metadata/object boundaries, proposed source-image envelope, and longest representative fake request can operate with defensible headroom on the selected zero-billing services.

No supported image limit is approved from local measurements alone. P01 remains incomplete until the Linux deployment and live Supabase proofs pass.

## Evidence log

### Pinned Linux CI

GitHub Actions run `34039713831` completed successfully on Ubuntu 24.04 using `.nvmrc` and the locked npm installation. Lint, generated Next.js types/type-check, all 154 tests, the production build, and the clean-generated-files check passed. This proves the pinned Linux build but not Render startup or memory behavior.

### Local protected HTTP probes

Date: 6 September 2026.
Environment: macOS arm64, Node 22.16.0. This differs from the repository's pinned Node 24.19.0 Linux target and is diagnostic evidence only.

Command shape:

```text
CLOUD_SPIKE_URL=<local-origin> CLOUD_SPIKE_TOKEN=<redacted> npm run cloud:spike:render
```

Fresh production server for each fixture:

| Edge | Raw RGBA | Source PNG | Candidate PNG | Change map | Pipeline | HTTP observed | Initial RSS | Peak RSS | RSS increase |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,024 | 4,194,304 B | 3,592,603 B | 3,594,115 B | 560,560 B | 1,215.19 ms | 1,419.31 ms | 134,086,656 B | 170,426,368 B | 36,339,712 B |
| 1,536 | 9,437,184 B | 8,082,424 B | 8,085,571 B | 1,256,200 B | 1,854.75 ms | 2,041.12 ms | 116,998,144 B | 223,232,000 B | 106,233,856 B |
| 2,048 | 16,777,216 B | 14,368,064 B | 14,374,091 B | 2,233,170 B | 2,646.94 ms | 2,856.28 ms | 115,376,128 B | 286,932,992 B | 171,556,864 B |

Every case completed and returned `replace-scope-mismatch`, as expected for the deliberately broad fake edit. The production-server measurements are substantially lower than the initial development-server observation (770,506,752-byte peak RSS at 2,048), confirming that development overhead cannot determine the host envelope. The 2,048 production case still needs the real Render Linux measurement because platform memory accounting and the pinned runtime differ.

### Live Supabase migration structure

Date: 6 September 2026.
Environment: isolated Supabase Free project `vfpafxzczdblsbsslhcg`.

The user applied `20260906142411_cloud_spike_foundation.sql` through the Supabase SQL Editor. A subsequent read-only catalog query confirmed:

| Check | Observed |
|---|---:|
| Metadata-table RLS enabled | `true` |
| `authenticated` can select | `true` |
| `authenticated` can insert | `true` |
| `authenticated` can update | `false` |
| `authenticated` can delete | `true` |
| Metadata ownership policies | `3` |
| Storage ownership policies | `3` |
| Spike bucket private | `true` |

This proves that the intended objects and privilege shape exist in the live project. Structural presence alone does not prove behavior, so the separate two-user API proof below tests owner success, foreign-user denial, anonymous denial, signed transfer, and cleanup using real user sessions.

### Live Supabase behavior proof

Date: 6 September 2026.
Fixture run: `d807cd89-5bab-4e9c-97db-c9c07ef19b4d`.

The public Supabase APIs were exercised with two temporary authenticated users and one synthetic 64 × 64 PNG. The owner metadata insert/read passed; the foreign-user read returned no row; a forged-owner insert was rejected; the signed upload and owner download passed; and foreign-user and anonymous object reads were rejected. The fixture contained 267 bytes.

The proof's `finally` cleanup removed the object, metadata row, and both Auth users. A separate read-only SQL query then confirmed zero probe rows, zero objects in `mirai-cloud-spike`, and zero Auth users carrying the spike fixture marker. No production data or paid provider was used.

## Pending evidence

- [x] Pinned Node 24.19.0 Linux dependency installation and production build in GitHub CI.
- [ ] Render production start using pinned Node 24.19.0 and npm 11.17.x.
- [ ] Protected Render probe at 1,024 × 1,024.
- [ ] Protected Render probe at 1,536 × 1,536.
- [ ] Protected Render probe at 2,048 × 2,048, or a bounded failure/restart observation.
- [ ] Render cold-start, warm-start, and restart observations.
- [x] Live Supabase migration applied to the isolated project; catalog structure verified read-only.
- [x] Two-user RLS metadata isolation proof.
- [x] Private Storage signed upload/read/delete and foreign/anonymous denial proof.
- [x] Test-fixture cleanup confirmation.
- [ ] Final supported-envelope and request-execution verdict.

## Provisional risk

The 2,048² proposal may need to be reduced if Render's total RSS approaches or exceeds its instance limit. A lower envelope is preferable to an editor that crashes while accepting an edit. Any product-limit change will be presented for approval with the Render measurements.
