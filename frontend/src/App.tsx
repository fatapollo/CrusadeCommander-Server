import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, AuthProvider } from './auth/AuthContext';
import AuthPage from './pages/AuthPage';
import CampaignsListPage from './pages/CampaignsListPage';
import WizardPage from './pages/WizardPage';
import DashboardPage from './pages/DashboardPage';
import ForceDetailPage from './pages/ForceDetailPage';
import UnitDetailPage from './pages/UnitDetailPage';
import BattleEntryPage from './pages/BattleEntryPage';
import MapBuilderPage from './pages/MapBuilderPage';
import AcceptInvitePage from './pages/AcceptInvitePage';
import AdminPage from './pages/AdminPage';
import { Spinner } from './components/ui';

// Auth gate. Every page renders its own full-bleed Bunker layout
// (BunkShell/BunkNav or BunkPage) — there is no shared Shell chrome.
function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          <Route path="/invite/:code" element={<AcceptInvitePage />} />
          <Route path="/campaigns" element={<Protected><CampaignsListPage /></Protected>} />
          <Route path="/campaigns/new" element={<Protected><WizardPage /></Protected>} />
          <Route path="/campaigns/:campaignId" element={<Protected><DashboardPage /></Protected>} />
          <Route path="/campaigns/:campaignId/battles/new" element={<Protected><BattleEntryPage /></Protected>} />
          <Route path="/campaigns/:campaignId/map/builder" element={<Protected><MapBuilderPage /></Protected>} />
          <Route path="/campaigns/:campaignId/forces/:forceId" element={<Protected><ForceDetailPage /></Protected>} />
          <Route path="/campaigns/:campaignId/units/:unitId" element={<Protected><UnitDetailPage /></Protected>} />
          <Route path="/admin" element={<Protected><AdminPage /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
