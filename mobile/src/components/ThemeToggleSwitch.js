import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';

export default function ThemeToggleSwitch({
  isDark,
  onToggle,
  size = 'md',
  disabled = false,
  style,
}) {
  const anim = useRef(new Animated.Value(isDark ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: isDark ? 1 : 0,
      useNativeDriver: true,
      stiffness: 260,
      damping: 22,
      mass: 1,
    }).start();
  }, [isDark, anim]);

  const dims = size === 'sm' ? SIZES.sm : SIZES.md;
  const trackBg = isDark ? '#334155' : '#e2e8f0';
  const thumbBg = isDark ? '#1e293b' : '#ffffff';
  const thumbBorder = isDark ? '#0f172a' : '#cbd5e1';
  const activeIcon = isDark ? '#f8fafc' : '#0f172a';
  const idleIcon = isDark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)';

  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onToggle}
      activeOpacity={0.9}
      style={[styles.hit, style]}
      accessibilityRole="switch"
      accessibilityState={{ checked: !!isDark, disabled: !!disabled }}
      accessibilityLabel={isDark ? 'Dark theme' : 'Light theme'}
    >
      <Animated.View style={[styles.track, { width: dims.trackW, height: dims.trackH, backgroundColor: trackBg }]}>
        <View style={[styles.trackIcons, { paddingHorizontal: dims.iconPad }]}>
          <Feather name="sun" size={dims.icon} color={idleIcon} style={isDark ? styles.iconDim : undefined} />
          <Feather name="moon" size={dims.icon} color={idleIcon} style={!isDark ? styles.iconDim : undefined} />
        </View>
        <Animated.View
          style={[
            styles.thumb,
            {
              width: dims.thumb,
              height: dims.thumb,
              top: dims.pad,
              backgroundColor: thumbBg,
              borderColor: thumbBorder,
              transform: [
                {
                  translateX: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [dims.pad, dims.trackW - dims.thumb - dims.pad],
                  }),
                },
              ],
            },
          ]}
        >
          <Feather name={isDark ? 'moon' : 'sun'} size={dims.icon} color={activeIcon} />
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const SIZES = {
  sm: { trackW: 52, trackH: 28, thumb: 24, pad: 2, icon: 13, iconPad: 7 },
  md: { trackW: 58, trackH: 32, thumb: 28, pad: 2, icon: 15, iconPad: 8 },
};

const styles = StyleSheet.create({
  hit: { paddingHorizontal: 2, paddingVertical: 2 },
  track: {
    borderRadius: 999,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trackIcons: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    pointerEvents: 'none',
  },
  iconDim: {
    opacity: 0.22,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
});
