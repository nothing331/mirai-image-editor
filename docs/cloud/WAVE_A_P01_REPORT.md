# Wave A P01 feasibility report

**Status:** Evidence complete; verdict ready for user acceptance before P02.
**Scope:** Synthetic fixtures only, fake AI only, no production data.
**Target:** Render Free web service plus Supabase Free database/Auth/Storage.

## Decision under test

Determine whether Mirai's pinned production runtime, private metadata/object boundaries, proposed source-image envelope, and longest representative fake request can operate with defensible headroom on the selected zero-billing services.

The live evidence supports a 2,048-pixel maximum source edge for the initial zero-billing deployment, provided the application admits only one memory-heavy image request at a time. This is a P01 feasibility verdict, not yet a product limit or authorization to begin P02; the user checkpoint remains required.

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

Every case completed and returned `replace-scope-mismatch`, as expected for the deliberately broad fake edit. The production-server measurements are substantially lower than the initial development-server observation (770,506,752-byte peak RSS at 2,048), confirming that development overhead cannot determine the host envelope.

### Live Render runtime and protected HTTP probes

Date: 7 September 2026.
Environment: Render Free web service in Singapore, 0.1 CPU, 512 MB RAM, Linux x64, commit `91a9122` for the measurements and commit `9333ae0` for the final isolation proof.

Render installed the locked dependencies with `npm ci`, built Next.js 16.3.2, and started the production server with Node 24.19.0 and the repository's `npm run start` command on Render's assigned port. A clean deployment completed in 1 minute 19 seconds. A controlled service restart succeeded, and the server became ready again without operator repair.

Warm protected benchmark requests produced:

| Edge | Pipeline | HTTP observed | Initial RSS | Peak RSS | RSS increase |
|---:|---:|---:|---:|---:|---:|
| 1,024 | 4,958.44 ms | 5,497.50 ms | 127,647,744 B | 187,392,000 B | 59,744,256 B |
| 1,536 | 8,340.03 ms | 8,573.58 ms | 187,392,000 B | 245,415,936 B | 58,023,936 B |
| 2,048 | 13,574.96 ms | 13,769.81 ms | 245,415,936 B | 339,628,032 B | 94,212,096 B |

The 2,048 case used 63.3% of the 512 MiB instance limit at the observed process peak, leaving approximately 188 MiB (36.7%) of process headroom. A 4,096 request was rejected before processing with HTTP 400 and `Unsupported synthetic fixture size.` All accepted cases completed through the real HTTP route and fake-provider pipeline.

A fresh-deployment 1,024 request completed in 6,802.78 ms end to end with a 189,952,000-byte peak RSS. After a controlled restart, the same case completed in 5,319.29 ms with a 200,392,704-byte peak. Waking the sleeping Free instance exceeded the client's 30-second observation window before the application response, confirming that cold-start delay is user-visible and must not be presented as always-on service. Render itself warns that an idle Free instance can take 50 seconds or more to wake.

No benchmark step used filesystem durability. The deployment treats Render's filesystem as disposable, while the Supabase proof owns all durable fixture state. One dependency audit warning was reported during the Render build; the production-only audit reports no production vulnerability, so the remaining warning is tracked as a development-dependency risk rather than a P01 runtime blocker.

### Deployed API isolation and shutdown

The first deployment check revealed that existing local-only project and diagnostic APIs were reachable without authentication. P01 therefore added `src/proxy.ts`, guarded by `CLOUD_SPIKE_ISOLATED_DEPLOYMENT=true`, so the isolated service exposes no ordinary API route. The final deployment `dep-daf65c1t0dsc73co21vg` succeeded from commit `9333ae0` in 1 minute 32 seconds.

Live probes confirmed `/` remains available with HTTP 200, while `/api/projects`, `/api/projects/probe`, `/api/request-logs`, `/api/request-logs/probe`, `/api/image-edits`, `/api/asset-generations`, `/api/image-extends/plan`, and `/api/image-extends/generate` return HTTP 404 with `Cache-Control: no-store`. `CLOUD_SPIKE_ENABLED=false` leaves the protected benchmark unavailable after measurement. The inert spike token remains stored as a Render secret; it authorizes nothing while the endpoint is disabled and can be removed later through the owner's secret-rotation process.

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

## Acceptance evidence

- [x] Pinned Node 24.19.0 Linux dependency installation and production build in GitHub CI.
- [x] Render production start using pinned Node 24.19.0 and npm 11.17.x.
- [x] Protected Render probe at 1,024 × 1,024.
- [x] Protected Render probe at 1,536 × 1,536.
- [x] Protected Render probe at 2,048 × 2,048, plus safe 4,096 rejection.
- [x] Render cold-start, warm-start, and restart observations.
- [x] Live Supabase migration applied to the isolated project; catalog structure verified read-only.
- [x] Two-user RLS metadata isolation proof.
- [x] Private Storage signed upload/read/delete and foreign/anonymous denial proof.
- [x] Test-fixture cleanup confirmation.
- [x] Final supported-envelope and request-execution verdict.

## Verdict

**Proceed to P02 after the user accepts this verdict.** Keep Render Free and Supabase Free for the next foundation phase, keep real AI disabled, and adopt a provisional maximum source edge of 2,048 pixels with one memory-heavy request admitted at a time. The observed worst case completed in 13.77 seconds and retained 36.7% process-memory headroom.

This verdict does not prove real-provider latency or reliability. Render Free can sleep, restart, and delay the first request beyond 30 seconds. P02 should therefore make these constraints explicit and fail closed; later real-provider testing must decide whether request-bound AI remains acceptable or needs a durable executor. Do not raise the edge limit or heavy-request concurrency without new host measurements.
