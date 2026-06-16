import { Platform } from 'react-native';

/**
 * Lazy-load datetimepicker so the native module is not required at app startup.
 */
export function openAndroidDatePicker({ value, minimumDate, maximumDate, mode = 'date', onSelect }) {
  if (Platform.OS !== 'android') return;
  const { DateTimePickerAndroid } = require('@react-native-community/datetimepicker');
  DateTimePickerAndroid.open({
    value: value || new Date(),
    mode,
    minimumDate,
    maximumDate,
    onChange: (_event, selectedDate) => {
      if (!selectedDate) return;
      onSelect?.(selectedDate);
    },
  });
}

export function openAndroidDateTimePicker({ value, minimumDate, onChange }) {
  if (Platform.OS !== 'android') return;
  const base = value || new Date();
  openAndroidDatePicker({
    value: base,
    minimumDate,
    mode: 'date',
    onSelect: (selectedDate) => {
      const withDate = new Date(base);
      withDate.setFullYear(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate()
      );
      openAndroidDatePicker({
        value: withDate,
        mode: 'time',
        onSelect: (selectedTime) => {
          const next = new Date(withDate);
          next.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
          onChange?.(next);
        },
      });
    },
  });
}
