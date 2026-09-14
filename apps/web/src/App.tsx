import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { Login } from "./pages/Login";
import { GamesList } from "./pages/GamesList";
import { GameDetail } from "./pages/GameDetail";
import { CombinedStats } from "./pages/CombinedStats";
import { SharedView } from "./pages/SharedView";
import { Nav } from "./components/Nav";

function AdminGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!isAdmin) return <Login />;
  return (
    <>
      <Nav />
      <main className="page">{children}</main>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/catan-live">
        <Routes>
          <Route
            path="/"
            element={
              <AdminGate>
                <GamesList />
              </AdminGate>
            }
          />
          <Route
            path="/games/:gameId"
            element={
              <AdminGate>
                <GameDetail />
              </AdminGate>
            }
          />
          <Route
            path="/stats"
            element={
              <AdminGate>
                <CombinedStats />
              </AdminGate>
            }
          />
          <Route path="/shared/:shareId" element={<main className="page">{<SharedView />}</main>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
