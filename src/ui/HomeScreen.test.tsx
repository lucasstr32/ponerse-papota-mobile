import { render, screen } from '@testing-library/react-native';

import { HomeScreen } from './HomeScreen';

import { strings } from '@/i18n';

it('renders the title and the empty state', async () => {
  await render(<HomeScreen />);
  expect(screen.getByRole('header', { name: strings.home.title })).toBeTruthy();
  expect(screen.getByText(strings.home.empty)).toBeTruthy();
});
