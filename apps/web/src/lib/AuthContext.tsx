import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(!!nextUser && !!nextUser.email); // hold "loading" until the admins/{email} check below resolves
      if (!nextUser?.email) setIsAdmin(false);
    });
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    // Admin status is an `admins/{email}` Firestore doc, not a custom auth claim —
    // see firestore.rules and CLAUDE.md §2.5 for why. A denied read (non-admin)
    // resolves this as "not admin" rather than an error.
    return onSnapshot(
      doc(db, "admins", user.email),
      (snap) => {
        setIsAdmin(snap.exists());
        setLoading(false);
      },
      () => {
        setIsAdmin(false);
        setLoading(false);
      },
    );
  }, [user]);

  const value: AuthState = {
    user,
    loading,
    isAdmin,
    signIn: async () => {
      await signInWithPopup(auth, googleProvider);
    },
    signOut: () => firebaseSignOut(auth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
