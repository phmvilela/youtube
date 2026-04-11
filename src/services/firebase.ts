import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyDCFFKev7dEHXPSeUAAWNCc0Yez-YeGuDE",
  authDomain: "kids-462502.firebaseapp.com",
  projectId: "youtube-kids-462502",
  storageBucket: "youtube-kids-462502.firebasestorage.app",
  messagingSenderId: "944053436879",
  appId: "1:944053436879:web:f3071d69b410dc63a452ba",
  measurementId: "G-BHXC7NC6EB",
} as const;

export const appConfig = {
  collectionName: "videos",
  databaseId: "youtube-kids",
  googleClientId: "944053436879-oqgtkeh77saqomocuc45rf68tv24i6qf.apps.googleusercontent.com",
  gasSyncUrl: "https://script.google.com/macros/s/AKfycbyje1MwfrEGwpycudBc9Xx-N_3uFij154idyRZEiisXgtI2GygpiBeu9tgiUUxhpRgX/exec",
  gasAuthUrl: "https://script.google.com/macros/s/AKfycbxiHu0Gw5DbmR7_ZP6tgKg4mqC2FKXIK0FBoWjoaWMSXquJpDv5sxRowBAvHviRq1zg2Q/exec",
  cloudRunStreamUrl: "https://us-central1-youtube-kids-462502.cloudfunctions.net/streamContents"
} as const;

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app, appConfig.databaseId);
