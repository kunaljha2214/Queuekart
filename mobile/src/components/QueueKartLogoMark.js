import React from 'react';
import { StyleSheet, View } from 'react-native';
import { orderlyFlow } from '../theme/orderlyFlow';

/** Abstract ticket / queue mark matching Stitch hero branding (no remote asset). */
export default function QueueKartLogoMark({ size = 48 }) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.22 }]}>
      <View style={[styles.bar, { width: size * 0.35 }]} />
      <View style={[styles.bar, styles.barMid, { width: size * 0.45 }]} />
      <View style={[styles.bar, { width: size * 0.28 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: orderlyFlow.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bar: {
    height: 3,
    backgroundColor: orderlyFlow.colors.onPrimary,
    borderRadius: 2,
    marginVertical: 2,
    opacity: 0.95,
  },
  barMid: {
    opacity: 1,
  },
});
