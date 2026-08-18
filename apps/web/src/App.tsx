import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { Login } from "./pages/Login";
import { GamesList } from "./pages/GamesList";
import { SharedView } from "./pages/SharedView";

function AdminGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!isAdmin) return <Login />;
  return <>{children}</>;
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
          <Route path="/shared/:shareId" element={<SharedView />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
