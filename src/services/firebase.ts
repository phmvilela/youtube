import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const appConfig = {
  collectionName: "videos",
  databaseId: import.meta.env.VITE_FIRESTORE_DATABASE_ID || "youtube-kids",
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  gasSyncUrl: import.meta.env.VITE_GAS_SYNC_URL,
  gasAuthUrl: import.meta.env.VITE_GAS_AUTH_URL,
  cloudRunStreamUrl: import.meta.env.VITE_CLOUD_RUN_STREAM_URL,
  cloudRunSearchUrl: import.meta.env.VITE_CLOUD_RUN_SEARCH_URL,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app, appConfig.databaseId);
