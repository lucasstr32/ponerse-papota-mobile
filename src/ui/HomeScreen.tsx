import { StyleSheet, Text, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { strings } from '@/i18n';

export function HomeScreen() {
  const dark = useColorScheme() === 'dark';
  const color = dark ? '#F2F2F2' : '#1A1A1A';
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: dark ? '#121212' : '#FFFFFF' }]}>
      <Text accessibilityRole="header" style={[styles.title, { color }]}>
        {strings.home.title}
      </Text>
      <Text style={{ color }}>{strings.home.empty}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
});
