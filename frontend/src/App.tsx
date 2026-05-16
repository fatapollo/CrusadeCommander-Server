import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, AuthProvider } from './auth/AuthContext';
import AuthPage from './pages/AuthPage';
import CampaignsListPage from './pages/CampaignsListPage';
import WizardPage from './pages/WizardPage';
import DashboardPage from './pages/DashboardPage';
import ForceDetailPage from './pages/ForceDetailPage';
import UnitDetailPage from './pages/UnitDetailPage';
import AcceptInvitePage from './pages/AcceptInvitePage';
import AdminPage from './pages/AdminPage';
import Shell from './components/Shell';
import { Spinner } from './components/ui';

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/" replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          <Route path="/invite/:code" element={<AcceptInvitePage />} />
          <Route path="/campaigns" element={<ProtectedShell><CampaignsListPage /></ProtectedShell>} />
          <Route path="/campaigns/new" element={<ProtectedShell><WizardPage /></ProtectedShell>} />
          <Route path="/campaigns/:campaignId" element={<ProtectedShell><DashboardPage /></ProtectedShell>} />
          <Route path="/campaigns/:campaignId/forces/:forceId" element={<ProtectedShell><ForceDetailPage /></ProtectedShell>} />
          <Route path="/campaigns/:campaignId/units/:unitId" element={<ProtectedShell><UnitDetailPage /></ProtectedShell>} />
          <Route path="/admin" element={<ProtectedShell><AdminPage /></ProtectedShell>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
