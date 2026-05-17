import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { doc, getDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import type { UserProfile } from "@/types";

type AuthContextValue = {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const missingProfileMessage = "Your Firebase login is valid, but this account does not have an active app profile. Ask an admin to create users/{uid} in Firestore.";
const disabledProfileMessage = "This user account is disabled.";

async function readProfile(uid: string) {
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) return null;
  return { uid, ...snapshot.data() } as UserProfile;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function refreshProfile() {
    if (!auth.currentUser) {
      setProfile(null);
      return;
    }
    const nextProfile = await readProfile(auth.currentUser.uid);
    if (!nextProfile) {
      setError(missingProfileMessage);
      await signOut(auth);
      return;
    }
    if (nextProfile.status !== "active") {
      setError(disabledProfileMessage);
      await signOut(auth);
      return;
    }
    setProfile(nextProfile);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setError("");
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const nextProfile = await readProfile(user.uid);
        if (!nextProfile) {
          setError(missingProfileMessage);
          await signOut(auth);
          return;
        }
        if (nextProfile.status !== "active") {
          setError(disabledProfileMessage);
          await signOut(auth);
          return;
        }
        setProfile(nextProfile);
      } catch (error) {
        if (error instanceof FirebaseError && error.code === "permission-denied") {
          setError("Firestore denied access to your user profile. Deploy the updated firestore.rules file, then try again.");
        } else {
          setError("Could not validate your user profile.");
        }
        await signOut(auth);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  async function login(email: string, password: string) {
    setError("");
    await signInWithEmailAndPassword(auth, email, password);
    navigate("/projects/");
  }

  async function logout() {
    await signOut(auth);
    setProfile(null);
    navigate("/login");
  }

  return (
    <AuthContext.Provider value={{ firebaseUser, profile, loading, error, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
