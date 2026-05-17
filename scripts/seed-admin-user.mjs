import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function loadEnvFile() {
  try {
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
  } catch {
    throw new Error("Missing .env.local. Copy .env.local.example to .env.local and add Firebase Admin credentials first.");
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

loadEnvFile();

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || required("VITE_FIREBASE_PROJECT_ID");
const clientEmail = required("FIREBASE_ADMIN_CLIENT_EMAIL");
const privateKey = required("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

const email = "gaurav.k@gomogroup.com";
const password = "gaurav@gomo";
const name = "Gaurav K";

const auth = getAuth();
const db = getFirestore();

let user;
try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, {
    displayName: name,
    password,
    disabled: false,
  });
  console.log(`Updated Firebase Auth user: ${email}`);
} catch (error) {
  if (error.code !== "auth/user-not-found") throw error;
  user = await auth.createUser({
    email,
    password,
    displayName: name,
    disabled: false,
  });
  console.log(`Created Firebase Auth user: ${email}`);
}

const timestamp = new Date().toISOString();
await db.collection("users").doc(user.uid).set(
  {
    uid: user.uid,
    name,
    email,
    role: "admin",
    status: "active",
    updatedAt: timestamp,
    createdAt: timestamp,
  },
  { merge: true },
);

console.log("Firestore profile is active admin.");
