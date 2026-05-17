import { Navigate, Route, Routes } from "react-router-dom";
import { AdminPage } from "@/pages/AdminPage";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import { LogsPage } from "@/pages/LogsPage";
import { ProjectCreatePage } from "@/pages/ProjectCreatePage";
import { ProjectEditPage } from "@/pages/ProjectEditPage";
import { ProjectPage } from "@/pages/ProjectPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { TeamMembersPage } from "@/pages/TeamMembersPage";
import { GeoTaskListPage } from "@/pages/GeoTaskListPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/projects/" replace />} />
      <Route path="/projects" element={<HomePage />} />
      <Route path="/projects/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/user-management" element={<AdminPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/team-members" element={<TeamMembersPage />} />
      <Route path="/geo-task-list" element={<GeoTaskListPage />} />
      <Route path="/logs" element={<LogsPage />} />
      <Route path="/projects/new" element={<ProjectCreatePage />} />
      <Route path="/projects/:projectId/edit" element={<ProjectEditPage />} />
      <Route path="/projects/:projectId" element={<ProjectPage />} />
      <Route path="*" element={<Navigate to="/projects/" replace />} />
    </Routes>
  );
}
