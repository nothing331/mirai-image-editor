# Contributing to Mirai

Thanks for helping improve Mirai. Bug reports, focused fixes, tests, documentation, and carefully scoped feature proposals are welcome.

## Before you start

- Search existing issues before opening a new one.
- Open an issue before starting a material feature or behavior change so its scope can be agreed first.
- Never include API keys, uploaded images, prompts, masks, generated images, or local diagnostics in an issue or pull request.

## Local setup

Mirai uses the Node.js and npm versions declared in `.nvmrc` and `package.json`.

```bash
nvm install
nvm use
cp .env.example .env.local
npm ci
npm run dev
```

The default fake providers require no secrets or paid API calls.

## Verification

Run the standard checks before opening a pull request:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For browser-facing changes, also run:

```bash
npx playwright install chromium
npm run test:e2e
```

## Pull requests

- Keep each pull request focused on one outcome.
- Include tests for changed behavior and update the relevant documentation.
- Describe the user outcome, implementation, verification, tradeoffs, and known limitations.
- Preserve the original image, immutable accepted versions, and the edit-pipeline invariants documented in `AGENTS.md`.
- Confirm generated files and sensitive local artifacts are not included in the diff.

By submitting a contribution, you agree that it may be distributed under the Apache License 2.0.
