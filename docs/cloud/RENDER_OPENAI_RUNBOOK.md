# Render OpenAI configuration

Changing `IMAGE_EDIT_PROVIDER` and `ASSET_GENERATION_PROVIDER` to `openai` does not enable cloud AI. The checked-in Render manifest keeps AI disabled, so that combination fails validation deliberately. The build preflight now checks this before Next.js compilation; startup and instrumentation repeat the same checks. An existing manually configured Render service must use `npm ci && npm run cloud:config:check && npm run build` as its build command to get the early check.

## Invitation launch

Keep `MIRAI_AI_ENABLED=false`, both providers `fake`, and remove `OPENAI_API_KEY`. If the invitation-mode feature is deployed, keep `MIRAI_INVITATION_MODE=true`. That mode cannot run with real providers, an AI key, or enabled AI, even for an approved owner.

## Qualified real-AI deployment

Retain the canonical HTTPS URL, exact allowed origins, browser-safe Supabase settings, server-only Supabase credential, owner list, matching migrations and recorded release ID. Set these values in Render's Environment panel:

| Name | Value / requirement |
|---|---|
| `MIRAI_APP_MODE` | `beta` (or isolated `staging` qualification) |
| `MIRAI_PERSISTENCE_MODE` | `disabled`; this closes local disk persistence, not cloud projects |
| `MIRAI_AUTH_ENABLED` | `true` |
| `MIRAI_INVITATION_MODE` | `false`, when that feature is deployed |
| `MIRAI_AI_ENABLED` | `true` |
| `IMAGE_EDIT_PROVIDER` | `openai` |
| `ASSET_GENERATION_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | A valid server-only provider key |
| `MIRAI_AI_HOST_QUALIFIED` | `true` **only after recorded hosted qualification** |
| `MIRAI_AI_IMAGE_STAGE_MICROUSD` | Reviewed positive integer worst-case ceiling per image stage; at most 10,000,000 |
| `MIRAI_AI_TEXT_STAGE_MICROUSD` | Reviewed positive integer worst-case ceiling per text stage; at most 10,000,000 |
| `OPENAI_IMAGE_QUALITY` | `low` or `medium` |
| `OPENAI_IMAGE_MAX_EDGE` | Positive integer at most `1536` |
| `OPENAI_EXTEND_PROVIDER_MAX_EDGE` | Positive integer at most `1536` |

Use literal values in Render: enter `true`, not `"true"`, `yes`, `1`, or `MIRAI_AI_ENABLED=true`. Stage ceilings use integer micro-USD: 1 USD = 1,000,000. There are no universal funded defaults. Review ceilings for the actual models/quality before configuring them.

Runtime validity is separate from database admission. The service-only `ai_control` row also needs its approved positive budget and enabled gate; a user's 25 welcome credits are not a provider funding budget. Startup does not change either gate or make a paid provider call. Follow the [Wave D qualification and funding sequence](./WAVE_D_RUNBOOK.md#migration-and-safe-release-sequence), including full-pipeline time/memory, private-result recovery, shutdown and unknown outcomes. Do not mark qualification passed merely to make deployment green.

## Diagnose a failed deployment

1. Find the first error in Render's build/start logs. `Unsafe Mirai runtime configuration` identifies application configuration; a package install or compiler error is a different failure.
2. Read every listed variable-name error. Common failures are AI off with OpenAI providers, a missing key, absent qualification, absent/decimal stage ceilings, high quality, or excessive provider edges.
3. Correct the intended configuration and redeploy the exact reviewed revision. Confirm the configuration check, build and startup pass; then verify both health endpoints and an authenticated owned workflow under the approved budget.
4. Copy only variable-name errors for support. Never share credential values, full environment exports, private images or prompts.

For a safe rollback, keep AI disabled with fake providers and no provider key, or select the recorded compatible release. This configuration change does not require a database migration and does not remove the existing admission or history invariants.
