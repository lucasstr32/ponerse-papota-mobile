# Gym Tracker

An offline Android app that works out how much weight to load next, from the sets you have already logged.

## Problem

Anyone training with block-based routines has to decide, session after session, how much weight to put on each exercise. It usually ends up in a spreadsheet: manual, easy to get wrong, and disconnected from the training log.

## Solution

Gym Tracker plans routines, records every set and computes the next load from your history. It runs entirely on the phone: no account, no server and no network access.

## Highlights

- **Four progression modes:** `range` (double progression), `linear`, `wave` (weekly cycles) and `free`.
- **Offline by design:** the `INTERNET` permission is blocked in the preview and production builds. Only the development build keeps it, to reach Metro.
- **Data stays on the device:** local SQLite through `expo-sqlite` and Drizzle, with Android cloud auto backup turned off (`allowBackup: false`).
- **Pure domain layer:** `src/domain` is plain TypeScript, and ESLint rejects any import of React, Expo, storage libraries or other app layers.
- **Tested domain:** Jest enforces a 90% coverage threshold on `src/domain`, with property-based tests written with fast-check.
- **Side-by-side variants:** development, preview and production have their own application IDs, so all three can be installed on one phone.

## Stack

Expo SDK 58, React Native 0.88, React 19.3, TypeScript, Expo Router, expo-sqlite, Drizzle, Zustand, zod, Jest and React Native Testing Library.

## Screenshots

_Screenshots will be added once the first screens are built._

## Run it

Requirements: Node 22.22.1 or later in the 22 line, npm 10.9.11 or later in the 10 line, and an Android device or emulator with API 26 or later.

1. Install the dependencies: `npm ci --ignore-scripts`
2. Run typecheck, lint, format check and tests: `npm run check`
3. Install a development build on the device.
4. Start Metro: `npm run dev`

## Status and next steps

Early stage. The domain logic (rounding, set history, warm-ups and the progression engines) is implemented and tested. The app itself has an empty home screen, and the database opens without tables yet.

Next: the database schema and migrations, the screens to build routines and log sessions, and import and editing of data. The interface is in Spanish (es-AR) and weights are in kilograms.
