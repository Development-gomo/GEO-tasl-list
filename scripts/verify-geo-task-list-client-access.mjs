import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, getDocs, getFirestore, orderBy, query } from "firebase/firestore";

const planTypes = ["30", "60", "90"];

function loadEnvFile() {
  const raw = readFileSync(".env.local", "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index);
    let value = trimmed.slice(index + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  });
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

loadEnvFile();

const app = initializeApp({
  apiKey: required("VITE_FIREBASE_API_KEY"),
  authDomain: required("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: required("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});

const auth = getAuth(app);
const db = getFirestore(app);
const email = process.env.VERIFY_TEMPLATE_EMAIL || "gaurav.k@gomogroup.com";
const password = process.env.VERIFY_TEMPLATE_PASSWORD || "gaurav@gomo";

await signInWithEmailAndPassword(auth, email, password);

for (const planType of planTypes) {
  const phases = await getDocs(query(collection(db, "geoTaskLists", "master", "plans", planType, "phases"), orderBy("order")));
  let taskCount = 0;
  for (const phase of phases.docs) {
    const tasks = await getDocs(query(collection(db, "geoTaskLists", "master", "plans", planType, "phases", phase.id, "tasks"), orderBy("number")));
    taskCount += tasks.size;
  }
  console.log(`${planType}-day: ${phases.size} phases, ${taskCount} tasks`);
}

await signOut(auth);
process.exit(0);
