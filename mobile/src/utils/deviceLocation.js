import { Linking, PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

const ANDROID_LOCATION_OPTIONS = {
  showLocationDialog: true,
  forceRequestLocation: true,
  distanceFilter: 0,
};

export async function ensureLocationPermission() {
  if (Platform.OS !== 'android') {
    const status = await Geolocation.requestAuthorization('whenInUse');
    return status === 'granted';
  }

  const fineGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  if (fineGranted) return true;

  const coarseGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
  );
  if (coarseGranted) return true;

  const fine = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  if (fine === PermissionsAndroid.RESULTS.GRANTED) {
    return true;
  }

  const coarse = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
  );
  return coarse === PermissionsAndroid.RESULTS.GRANTED;
}

export function formatLocationError(error) {
  const code = error?.code;
  if (code === 1) {
    return 'Location permission denied. Enable it in Settings, or enter coordinates manually.';
  }
  if (code === 2) {
    return 'Location unavailable. On emulator use Extended controls → Location, or enter coordinates manually.';
  }
  if (code === 3) {
    return 'Location timed out. Tap Retry location or enter latitude/longitude manually.';
  }
  return (
    error?.message ||
    'Could not detect location. Enter latitude and longitude manually, or tap Retry.'
  );
}

export async function openAppSettings() {
  try {
    await Linking.openSettings();
  } catch {
    // no-op
  }
}

function getPositionWithHardTimeout(options, hardTimeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error('Location request timed out'), { code: 3 }));
    }, hardTimeoutMs);

    Geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(pos);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
      options
    );
  });
}

function watchPositionWithHardTimeout(options, hardTimeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let watchId = null;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (watchId != null) {
        Geolocation.clearWatch(watchId);
      }
      fn(value);
    };

    const timer = setTimeout(() => {
      finish(reject, Object.assign(new Error('Location request timed out'), { code: 3 }));
    }, hardTimeoutMs);

    watchId = Geolocation.watchPosition(
      (pos) => finish(resolve, pos),
      (err) => finish(reject, err),
      options
    );
  });
}

function readCoordinates(position) {
  const latitude = position?.coords?.latitude;
  const longitude = position?.coords?.longitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Could not read device location');
  }
  return { latitude, longitude };
}

/**
 * Network/cached fix first, then GPS, then watchPosition. Hard timeouts so the UI never hangs.
 */
export async function fetchDeviceCoordinates() {
  const ok = await ensureLocationPermission();
  if (!ok) {
    const err = new Error('Location permission denied');
    err.code = 1;
    throw err;
  }

  const androidOnly = Platform.OS === 'android' ? ANDROID_LOCATION_OPTIONS : {};
  const attempts = [
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 900000, ...androidOnly },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 0, ...androidOnly },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0, ...androidOnly },
  ];

  let lastError = new Error('Could not get location');
  for (const options of attempts) {
    try {
      const pos = await getPositionWithHardTimeout(options, (options.timeout || 8000) + 1500);
      return readCoordinates(pos);
    } catch (e) {
      lastError = e;
    }
  }

  try {
    const pos = await watchPositionWithHardTimeout(
      {
        enableHighAccuracy: false,
        maximumAge: 0,
        ...androidOnly,
      },
      12000
    );
    return readCoordinates(pos);
  } catch (e) {
    lastError = e;
  }

  throw lastError;
}
