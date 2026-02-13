import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogOut, ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export function GlobalAdminHeader() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleBackToLeagues = () => {
    navigate('/');
  };

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBackToLeagues} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back to Leagues
          </Button>
          <Link to="/admin" className="font-semibold text-lg hover:text-primary transition-colors">
            Prediction Market - Admin
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{user.username}</span>
            {isAdmin && (
              <Badge variant="secondary" className="text-xs">
                Admin
              </Badge>
            )}
          </div>

          <Button variant="ghost" size="icon" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
