import { useAuth } from '@/contexts/AuthContext';
import { useLeague } from '@/contexts/LeagueContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogOut, Coins, Briefcase, ArrowLeft, Copy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

export function Header() {
  const { user, isAdmin, logout } = useAuth();
  const { currentLeague, leagueBalance, leaveLeague } = useLeague();

  if (!user) return null;

  const copyJoinCode = () => {
    if (currentLeague) {
      navigator.clipboard.writeText(currentLeague.join_code);
      toast.success('Join code copied!');
    }
  };

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={leaveLeague} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Leagues
          </Button>
          <Link to="/" className="font-semibold text-lg hover:text-primary transition-colors">
            {currentLeague?.name ?? 'Prediction Market'}
          </Link>
          {currentLeague && (
            <button
              onClick={copyJoinCode}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="h-3 w-3" />
              {currentLeague.join_code}
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Coins className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{isAdmin ? '∞' : leagueBalance.toLocaleString()}</span>
          </div>

          <Link to="/portfolio" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <Briefcase className="h-4 w-4" />
            <span>Portfolio</span>
          </Link>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{user.username}</span>
            {isAdmin && (
              <Badge variant="secondary" className="text-xs">
                Admin
              </Badge>
            )}
          </div>
          
          {isAdmin && (
            <Link to="/admin">
              <Button variant="outline" size="sm">
                Admin
              </Button>
            </Link>
          )}
          
          <Button variant="ghost" size="icon" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
