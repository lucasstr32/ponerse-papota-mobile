# Gym Tracker

Offline Android app to plan strength routines, log every set and measure progress. Built with Expo
(React Native) and TypeScript.

> Early stage: the repository currently contains the project setup and an empty home screen.

## Requirements

- Node 22.22.1 or later in the 22 line (see `.nvmrc`)
- npm 10.9.11 or later in the 10 line

## Getting started

```bash
npm ci --ignore-scripts
npm run dev
```

`npm run dev` needs a development build installed on an Android device (API 26 or later).

## Scripts

| Script                  | Purpose                                |
| ----------------------- | -------------------------------------- |
| `npm run dev`           | Start Metro for a development build    |
| `npm run build`         | Export the Android bundle              |
| `npm test`              | Run the tests                          |
| `npm run test:coverage` | Run the tests with coverage            |
| `npm run check`         | Typecheck, lint, format check, tests   |
| `npm run format`        | Format the source files                |
| `npm run doctor`        | Check the project against the Expo SDK |

## Structure

- `app/`: Expo Router routes only
- `src/domain/`: pure TypeScript, with no React, Expo or storage imports
- `src/data/`: local database
- `src/ui/`: screens and components
- `src/i18n/`: user-facing texts

## Variants

`APP_VARIANT` selects `development`, `preview` or `production` (default). Each one has its own
application ID, so they install side by side. Only `development` keeps the `INTERNET` permission,
to reach Metro.

## Pre-commit checks

`scripts/pre-commit.sh` runs gitleaks and `npm run check`. To enable it locally:

```bash
ln -s ../../scripts/pre-commit.sh .git/hooks/pre-commit
```
