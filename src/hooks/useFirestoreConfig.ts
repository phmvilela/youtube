import { useState, useMemo } from 'react';
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";

const FIRESTORE_CONFIG_KEY = 'firestore-config';

export interface FirestoreConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  collectionName: string;
  databaseId: string;
}

export function useFirestoreConfig() {
  const [config, setConfig] = useState<FirestoreConfig | null>(() => {
    const stored = localStorage.getItem(FIRESTORE_CONFIG_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const saveConfig = (newConfig: FirestoreConfig) => {
    localStorage.setItem(FIRESTORE_CONFIG_KEY, JSON.stringify(newConfig));
    setConfig(newConfig);
  };

  const db = useMemo<Firestore | null>(() => {
    if (!config) return null;
    try {
      const apps = getApps();
      const app = apps.length ? apps[0] : initializeApp(config);
      return getFirestore(app, config.databaseId);
    } catch (e) {
      console.error("Failed to initialize firestore", e);
      return null;
    }
  }, [config]);

  return { config, saveConfig, db };
}
