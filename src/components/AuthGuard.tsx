import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function AuthGuard({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { firebaseUser, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading workspace...</div>;
  }

  if (!firebaseUser || !profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (adminOnly && profile.role !== "admin" && profile.role !== "super_admin") {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="panel max-w-md p-6 text-center">
          <h1 className="text-xl font-bold">Admin access required</h1>
          <p className="mt-2 text-sm text-slate-500">Your profile is active, but this area is only available to admins.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
