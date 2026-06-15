import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SALOON_PRESET_SERVICES } from '../constants/saloonServices';

export default function SaloonServicesEditor({ services, onChange, colors }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [customName, setCustomName] = useState('');

  const selectedKeys = useMemo(
    () => new Set((services || []).map((s) => String(s.name).toLowerCase())),
    [services]
  );

  const availablePresets = useMemo(
    () => SALOON_PRESET_SERVICES.filter((name) => !selectedKeys.has(name.toLowerCase())),
    [selectedKeys]
  );

  function addService(name, isCustom) {
    const trimmed = name.trim();
    if (!trimmed || selectedKeys.has(trimmed.toLowerCase())) return;
    onChange([...(services || []), { name: trimmed, isCustom }]);
  }

  function removeService(name) {
    onChange((services || []).filter((s) => s.name !== name));
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>Services offered</Text>

      {services?.length ? (
        <View style={styles.chipRow}>
          {services.map((service) => (
            <View
              key={service.name}
              style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>{service.name}</Text>
              <TouchableOpacity
                onPress={() => removeService(service.name)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.chipRemove, { color: colors.textSubtle }]}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.hint, { color: colors.textSubtle }]}>
          Add at least one service from the list or enter your own.
        </Text>
      )}

      <Text style={[styles.subLabel, { color: colors.textMuted }]}>Add from list</Text>
      <TouchableOpacity
        style={[styles.dropdownTrigger, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
        onPress={() => setShowDropdown((v) => !v)}
        activeOpacity={0.85}
        disabled={availablePresets.length === 0}
      >
        <Text style={[styles.dropdownText, { color: availablePresets.length ? colors.text : colors.textSubtle }]}>
          {availablePresets.length ? 'Select a service' : 'All preset services added'}
        </Text>
        <Text style={[styles.dropdownChevron, { color: colors.textSubtle }]}>
          {showDropdown ? '▲' : '▼'}
        </Text>
      </TouchableOpacity>

      {showDropdown && availablePresets.length ? (
        <View style={[styles.dropdownMenu, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {availablePresets.map((name) => (
            <TouchableOpacity
              key={name}
              style={styles.dropdownItem}
              onPress={() => {
                addService(name, false);
                setShowDropdown(false);
              }}
            >
              <Text style={[styles.dropdownItemText, { color: colors.text }]}>{name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <Text style={[styles.subLabel, { color: colors.textMuted, marginTop: 12 }]}>Add custom service</Text>
      <View style={styles.customRow}>
        <TextInput
          style={[
            styles.customInput,
            { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text },
          ]}
          placeholder="e.g. Head massage"
          placeholderTextColor={colors.placeholder}
          value={customName}
          onChangeText={setCustomName}
        />
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            addService(customName, true);
            setCustomName('');
          }}
          activeOpacity={0.88}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  subLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  hint: { fontSize: 13, marginBottom: 10, lineHeight: 18 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 8,
    gap: 6,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
  chipRemove: { fontSize: 14, fontWeight: '700' },
  dropdownTrigger: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: { fontSize: 15, fontWeight: '600' },
  dropdownChevron: { fontSize: 12 },
  dropdownMenu: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 12 },
  dropdownItemText: { fontSize: 15, fontWeight: '600' },
  customRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  addBtn: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 72,
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
