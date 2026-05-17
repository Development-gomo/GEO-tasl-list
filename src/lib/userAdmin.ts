import { FirebaseError, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, updatePassword, updateProfile } from "firebase/auth";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { auditDiff, createAuditLog } from "@/lib/auditLog";
import { db } from "@/lib/firebase";
import { nowIso } from "@/lib/time";
import type { UserProfile, UserRole, UserStatus } from "@/types";

const secondaryFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDUMMY_DUMMY_DUMMY_DUMMY_DUMMY_DUM",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "geo-service-local.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "geo-service-local",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "geo-service-local.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId: `${import.meta.env.VITE_FIREBASE_APP_ID || "1:000000000000:web:0000000000000000000000"}-secondary`,
};

const secondaryApp = initializeApp(secondaryFirebaseConfig, "admin-user-creation");
const secondaryAuth = getAuth(secondaryApp);

export async function createManagedUser({
  name,
  email,
  password,
  role,
  status,
}: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  status: UserStatus;
}) {
  const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  await updateProfile(credential.user, { displayName: name });
  await secondaryAuth.signOut();

  const timestamp = nowIso();
  await setDoc(doc(db, "users", credential.user.uid), {
    uid: credential.user.uid,
    name,
    email,
    role,
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await createAuditLog({
    actionLabel: "User Created",
    projectName: "Workspace",
    details: `Created user ${name}`,
    detailsEntries: [
      { task: "User Management", field: "Name", from: "", to: name },
      { task: "User Management", field: "Email", from: "", to: email },
      { task: "User Management", field: "Role", from: "", to: role },
      { task: "User Management", field: "Status", from: "", to: status },
    ],
  });

  return credential.user.uid;
}

export async function updateManagedUser(profile: Pick<UserProfile, "uid" | "name" | "role" | "status">) {
  const ref = doc(db, "users", profile.uid);
  const beforeSnapshot = await getDoc(ref);
  const before = beforeSnapshot.exists() ? beforeSnapshot.data() : null;
  await setDoc(
    ref,
    {
      name: profile.name,
      role: profile.role,
      status: profile.status,
      updatedAt: nowIso(),
    },
    { merge: true },
  );
  const detailsEntries = auditDiff(before, profile as unknown as Record<string, unknown>, {
    name: "Name",
    role: "Role",
    status: "Status",
  }, profile.name || "User");
  if (detailsEntries.length) {
    await createAuditLog({
      actionLabel: "User Updated",
      projectName: "Workspace",
      detailsEntries,
    });
  }
}

export async function deleteManagedUser(profile: Pick<UserProfile, "uid" | "name" | "email" | "role">) {
  await deleteDoc(doc(db, "users", profile.uid));
  await createAuditLog({
    actionLabel: "User Deleted",
    projectName: "Workspace",
    details: `Deleted user ${profile.name || profile.email}`,
    detailsEntries: [
      { task: "User Management", field: "Name", from: profile.name || profile.email || profile.uid, to: "" },
      { task: "User Management", field: "Email", from: profile.email || "", to: "" },
      { task: "User Management", field: "Role", from: profile.role, to: "" },
    ],
  });
}

export async function updateCurrentUserPassword(password: string) {
  const user = getAuth().currentUser;
  if (!user) throw new Error("You need to be signed in to update your password.");
  await updatePassword(user, password);
  await createAuditLog({
    actionLabel: "Password Updated",
    projectName: "Workspace",
    details: "Updated own account password",
    detailsEntries: [
      { task: "My Profile", field: "Password", from: "Previous password", to: "Updated" },
    ],
  });
}

export function userAdminError(error: unknown) {
  if (error instanceof FirebaseError) return error.message;
  if (error instanceof Error) return error.message;
  return "User management request failed.";
}
