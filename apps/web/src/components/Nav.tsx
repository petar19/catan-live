import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

export function Nav() {
  const { user, signOut } = useAuth();
  return (
    <nav className="top-nav">
      <Link to="/">Games</Link>
      <Link to="/stats">Combined stats</Link>
      <span className="spacer" />
      <span className="muted">{user?.email}</span>
      <button onClick={() => void signOut()}>Sign out</button>
    </nav>
  );
}
