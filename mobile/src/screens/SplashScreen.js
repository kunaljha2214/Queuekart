import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QueueKartLogoMark from '../components/QueueKartLogoMark';

export default function SplashScreen() {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const t = setInterval(() => {
      setDotCount((d) => (d >= 3 ? 1 : d + 1));
    }, 450);
    return () => clearInterval(t);
  }, []);

  const dots = useMemo(() => '•'.repeat(dotCount), [dotCount]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.bg}>
        <View style={[styles.circle, styles.circleTop]} />
        <View style={[styles.circle, styles.circleBottom]} />

        <View style={styles.center}>
          <View style={styles.logoTile}>
            <QueueKartLogoMark size={56} />
          </View>
          <Text style={styles.title}>QueueKart</Text>
          <Text style={styles.subtitle}>Wait less, live more.</Text>
          <Text style={styles.loading}>Loading {dots}</Text>
        </View>

        <Text style={styles.footer}>Made by Kunal Jha</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b1220' },
  bg: { flex: 1, backgroundColor: '#0b1220' },
  circle: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 520,
    backgroundColor: '#14213A',
    opacity: 0.55,
  },
  circleTop: { top: -220, right: -220 },
  circleBottom: { bottom: -260, left: -220, opacity: 0.35 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoTile: {
    width: 96,
    height: 96,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  title: { color: '#E8F0FF', fontSize: 34, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#A8B7D4', fontSize: 15, marginBottom: 18 },
  loading: { color: '#A8B7D4', fontSize: 14, letterSpacing: 0.5 },
  footer: {
    color: '#A8B7D4',
    textAlign: 'center',
    paddingBottom: 18,
    fontSize: 26,
    opacity: 0.85,
  },
});

