import { openDatabaseSync } from 'expo-sqlite';

import { openDatabase } from './db';

jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn() }));

it('opens the database with WAL and foreign keys enabled', () => {
  const execSync = jest.fn();
  jest.mocked(openDatabaseSync).mockReturnValue({ execSync } as never);

  expect(openDatabase()).toBeDefined();

  expect(openDatabaseSync).toHaveBeenCalledWith('gym-tracker.db');
  expect(execSync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
});
