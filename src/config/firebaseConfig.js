import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Firebase Configuration & Cloud-Synced Storage Adapter
 *
 * When `EXPO_PUBLIC_FIREBASE_PROJECT_ID` and `EXPO_PUBLIC_FIREBASE_API_KEY` are configured
 * in `.env` (or EAS Environment Variables), PageQuest automatically syncs family accounts,
 * child invite codes, live reading progress, quiz history, and reward milestones across
 * parent and child devices via Cloud Firestore, while caching locally in `AsyncStorage`
 * for instant offline-capable performance.
 */
export const FIREBASE_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCiGds_GDJSn6zqJbv2YqtWnxD41GmHoBQ',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'pagequest-c23f1.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'pagequest-c23f1',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'pagequest-c23f1.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || ''
};

// App-level write verification token checked by Firestore Security Rules (firestore.rules)
const PAGEQUEST_APP_WRITE_TOKEN = 'pq_v1_client_7f9a2b4e8c1d';

// Keys that remain strictly local to a single physical device
const DEVICE_LOCAL_ONLY_KEYS = new Set(['@persistent_child_session']);

export function isFirebaseConfigured() {
  return Boolean(
    FIREBASE_CONFIG.projectId &&
      FIREBASE_CONFIG.projectId !== 'your_project_id'
  );
}

function getFirestoreDocUrl(storageKey) {
  const safeDocId = encodeURIComponent(storageKey.replace(/^@/, 'pq_'));
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    FIREBASE_CONFIG.projectId
  )}/databases/(default)/documents/pagequest_store/${safeDocId}`;
  return FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'your_firebase_api_key'
    ? `${base}?key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`
    : base;
}

/**
 * Cloud-backed drop-in replacement for AsyncStorage on shared family keys.
 * - Local-only keys (like `@persistent_child_session`) stay strictly on the device.
 * - Shared keys sync with Cloud Firestore when configured and fall back to AsyncStorage offline.
 */
export const cloudStorage = {
  async getItem(key) {
    if (DEVICE_LOCAL_ONLY_KEYS.has(key) || !isFirebaseConfigured()) {
      return AsyncStorage.getItem(key);
    }

    try {
      const response = await fetch(getFirestoreDocUrl(key), {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (response.ok) {
        const doc = await response.json();
        const remoteVal = doc?.fields?.payload?.stringValue;
        if (typeof remoteVal === 'string') {
          await AsyncStorage.setItem(key, remoteVal);
          return remoteVal;
        }
      } else if (response.status === 404) {
        // Document not in cloud yet; if we have local data, push it up in the background
        const localVal = await AsyncStorage.getItem(key);
        if (localVal !== null) {
          this.pushToCloud(key, localVal).catch(() => {});
        }
        return localVal;
      }
    } catch (err) {
      // Network offline or unreachable: fall back seamlessly to local cache
    }

    return AsyncStorage.getItem(key);
  },

  async setItem(key, value) {
    await AsyncStorage.setItem(key, value);

    if (!DEVICE_LOCAL_ONLY_KEYS.has(key) && isFirebaseConfigured()) {
      await this.pushToCloud(key, value);
    }
  },

  async removeItem(key) {
    await AsyncStorage.removeItem(key);

    if (!DEVICE_LOCAL_ONLY_KEYS.has(key) && isFirebaseConfigured()) {
      try {
        await fetch(getFirestoreDocUrl(key), { method: 'DELETE' });
      } catch (err) {
        // Ignore network errors on delete
      }
    }
  },

  async multiRemove(keys = []) {
    await AsyncStorage.multiRemove(keys);

    if (isFirebaseConfigured()) {
      await Promise.all(
        keys
          .filter((k) => !DEVICE_LOCAL_ONLY_KEYS.has(k))
          .map((k) => fetch(getFirestoreDocUrl(k), { method: 'DELETE' }).catch(() => {}))
      );
    }
  },

  async pushToCloud(key, stringValue) {
    try {
      await fetch(getFirestoreDocUrl(key), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            payload: { stringValue: String(stringValue) },
            updatedAt: { stringValue: new Date().toISOString() },
            appToken: { stringValue: PAGEQUEST_APP_WRITE_TOKEN }
          }
        })
      });
    } catch (err) {
      // Offline fallback: data is already saved in AsyncStorage
    }
  }
};
