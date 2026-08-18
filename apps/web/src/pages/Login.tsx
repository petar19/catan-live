import { useAuth } from "../lib/AuthContext";

export function Login() {
  const { user, isAdmin, loading, signIn, signOut } = useAuth();

  if (loading) return <p>Loading…</p>;

  if (!user) {
    return (
      <div>
        <p>Sign in to view your Catan stats.</p>
        <button onClick={() => void signIn()}>Sign in with Google</button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div>
        <p>Signed in as {user.email}, but this account isn't the admin.</p>
        <button onClick={() => void signOut()}>Sign out</button>
      </div>
    );
  }

  return (
    <div>
      <p>Signed in as {user.email} (admin).</p>
      <button onClick={() => void signOut()}>Sign out</button>
    </div>
  );
}
