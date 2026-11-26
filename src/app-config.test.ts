import type { ExpoConfig } from 'expo/config';

const INTERNET = 'android.permission.INTERNET';
const originalVariant = process.env.APP_VARIANT;

function loadConfig(variant?: string): ExpoConfig {
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  let config: ExpoConfig | undefined;
  jest.isolateModules(() => {
    config = jest.requireActual<{ default: ExpoConfig }>('../app.config').default;
  });
  if (!config) throw new Error('app.config did not load');
  return config;
}

afterEach(() => {
  if (originalVariant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = originalVariant;
});

describe('app config', () => {
  it.each([
    [undefined, 'app.papota.gymtracker'],
    ['production', 'app.papota.gymtracker'],
    ['preview', 'app.papota.gymtracker.preview'],
  ])('blocks INTERNET in variant %s', (variant, applicationId) => {
    const { android } = loadConfig(variant);
    expect(android?.package).toBe(applicationId);
    expect(android?.blockedPermissions).toContain(INTERNET);
  });

  it('allows INTERNET only in development', () => {
    const { android } = loadConfig('development');
    expect(android?.package).toBe('app.papota.gymtracker.dev');
    expect(android?.blockedPermissions).not.toContain(INTERNET);
  });

  it.each([undefined, 'development', 'preview', 'production'])(
    'disables Android Auto Backup in variant %s',
    (variant) => {
      expect(loadConfig(variant).android?.allowBackup).toBe(false);
    },
  );

  it('targets Android only, API 26 or later', () => {
    const config = loadConfig();
    expect(config.platforms).toEqual(['android']);
    expect(config.plugins).toContainEqual([
      'expo-build-properties',
      { android: { minSdkVersion: 26 } },
    ]);
  });

  it('rejects an unknown variant', () => {
    expect(() => loadConfig('staging')).toThrow('Unknown APP_VARIANT');
  });
});
