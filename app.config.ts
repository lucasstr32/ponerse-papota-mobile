import type { ExpoConfig } from 'expo/config';

type Variant = 'development' | 'preview' | 'production';

const VARIANTS: Record<Variant, { name: string; applicationId: string }> = {
  development: { name: 'Gym Tracker (dev)', applicationId: 'app.papota.gymtracker.dev' },
  preview: { name: 'Gym Tracker (preview)', applicationId: 'app.papota.gymtracker.preview' },
  production: { name: 'Gym Tracker', applicationId: 'app.papota.gymtracker' },
};

function isVariant(value: string): value is Variant {
  return Object.hasOwn(VARIANTS, value);
}

function resolveVariant(): Variant {
  // Defaults to production so a missing variable never grants network access.
  const value = process.env.APP_VARIANT ?? 'production';
  if (!isVariant(value)) throw new Error(`Unknown APP_VARIANT: ${value}`);
  return value;
}

const variant = resolveVariant();
const { name, applicationId } = VARIANTS[variant];

const config: ExpoConfig = {
  name,
  slug: 'gym-tracker',
  version: '0.1.0',
  scheme: variant === 'production' ? 'gymtracker' : `gymtracker-${variant}`,
  platforms: ['android'],
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  android: {
    package: applicationId,
    versionCode: 1,
    // The dev client needs the network to reach Metro; other builds are offline.
    blockedPermissions: variant === 'development' ? [] : ['android.permission.INTERNET'],
  },
  plugins: [
    'expo-router',
    'expo-localization',
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
