import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

export async function ensureLocationPermission() {
  if (Platform.OS !== 'android') {
    const status = await Geolocation.requestAuthorization('whenInUse');
    return status === 'granted';
  }

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

function getPositionWithHardTimeout(options, hardTimeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Location request timed out'));
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

/**
 * Fast network/cached fix first, then GPS. Hard timeouts so the UI never hangs.
 */
export async function fetchDeviceCoordinates() {
  const ok = await ensureLocationPermission();
  if (!ok) {
    throw new Error('Location permission denied');
  }

  const attempts = [
    { enableHighAccuracy: false, timeout: 4000, maximumAge: 300000 },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
  ];

  let lastError = new Error('Could not get location');
  for (const options of attempts) {
    try {
      const pos = await getPositionWithHardTimeout(options, options.timeout + 1000);
      const latitude = pos?.coords?.latitude;
      const longitude = pos?.coords?.longitude;
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return { latitude, longitude };
      }
      lastError = new Error('Could not read device location');
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError;
}
