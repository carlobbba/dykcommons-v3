import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LeagueProvider, useLeague } from "@/contexts/LeagueContext";
import { LoginScreen } from "@/components/LoginScreen";
import { VotingModal } from "@/components/VotingModal";
import { MarketsPage } from "@/pages/MarketsPage";
import { MarketDetailPage } from "@/pages/MarketDetailPage";
import { AdminPage } from "@/pages/AdminPage";
import { GlobalAdminPage } from "@/pages/GlobalAdminPage";
import { GlobalAdminHeader } from "@/components/GlobalAdminHeader";
import { PortfolioPage } from "@/pages/PortfolioPage";
import { LeaguesPage } from "@/pages/LeaguesPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppContent() {
  const { user, isLoading, isAdmin } = useAuth();
  const { currentLeague } = useLeague();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (!currentLeague) {
    if (isAdmin && location.pathname === '/admin') {
      return (
        <>
          <GlobalAdminHeader />
          <Routes>
            <Route path="/admin" element={<GlobalAdminPage />} />
          </Routes>
        </>
      );
    }
    return <LeaguesPage />;
  }

  return (
    <>
      <VotingModal />
      <Routes>
        <Route path="/" element={<MarketsPage />} />
        <Route path="/market/:id" element={<MarketDetailPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <LeagueProvider>
            <AppContent />
          </LeagueProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
