import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity } from 'react-native';

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
      // Animate only translateX on native driver for smoothness.
      // Colors switch instantly to avoid JS-thread animation jank.
      useNativeDriver: true,
      stiffness: 260,
      damping: 22,
      mass: 1,
    }).start();
  }, [isDark, anim]);

  const dims = size === 'sm' ? SIZES.sm : SIZES.md;

  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onToggle}
      activeOpacity={0.9}
      style={[styles.hit, style]}
      accessibilityRole="switch"
      accessibilityState={{ checked: !!isDark, disabled: !!disabled }}
    >
      <Animated.View
        style={[
          styles.track,
          {
            width: dims.trackW,
            height: dims.trackH,
            backgroundColor: isDark ? '#475569' : '#e5e7eb',
          },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              width: dims.thumb,
              height: dims.thumb,
              transform: [
                {
                  translateX: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [dims.pad, dims.trackW - dims.thumb - dims.pad],
                  }),
                },
              ],
              backgroundColor: isDark ? '#0f172a' : '#ffffff',
              borderColor: isDark ? '#0b1220' : '#cbd5e1',
            },
          ]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const SIZES = {
  sm: { trackW: 40, trackH: 24, thumb: 20, pad: 2 },
  md: { trackW: 44, trackH: 26, thumb: 22, pad: 2 },
};

const styles = StyleSheet.create({
  hit: { paddingHorizontal: 2, paddingVertical: 2 },
  track: {
    borderRadius: 999,
    justifyContent: 'center',
  },
  thumb: {
    borderRadius: 999,
    borderWidth: 1,
  },
});

