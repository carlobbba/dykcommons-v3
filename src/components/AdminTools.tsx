import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLeague } from '@/contexts/LeagueContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Coins, UserCog, Trash2, RotateCcw, Sparkles, LogIn } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type User = Tables<'users'>;
type Market = Tables<'markets'>;

interface AdminToolsProps {
  users: User[];
  markets: Market[];
  onRefresh: () => void;
}

const STORAGE_KEY = 'prediction_market_user_id';

export function AdminTools({ users, markets, onRefresh }: AdminToolsProps) {
  const { user } = useAuth();
  const { currentLeague } = useLeague();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [tokenAmount, setTokenAmount] = useState('1000');
  const [seedMarketId, setSeedMarketId] = useState('');
  const [seedOrderCount, setSeedOrderCount] = useState('6');
  const [isLoading, setIsLoading] = useState(false);

  const invokeAdmin = async (action: string, payload: Record<string, any>) => {
    if (!user) return null;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: { admin_user_id: user.id, action, payload: { ...payload, league_id: currentLeague?.id } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      onRefresh();
      return data;
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const handleGiveTokens = async () => {
    if (!selectedUserId || !tokenAmount) return;
    const data = await invokeAdmin('give_tokens', { user_id: selectedUserId, amount: parseInt(tokenAmount) });
    if (data) toast.success(data.message);
  };

  const handleSetBalance = async () => {
    if (!selectedUserId || tokenAmount === '') return;
    const data = await invokeAdmin('set_balance', { user_id: selectedUserId, amount: parseInt(tokenAmount) });
    if (data) toast.success(data.message);
  };

  const handleResetMarket = async (marketId: string) => {
    const data = await invokeAdmin('reset_market', { market_id: marketId });
    if (data) toast.success(data.message);
  };

  const handleDeleteMarket = async (marketId: string) => {
    const data = await invokeAdmin('delete_market', { market_id: marketId });
    if (data) toast.success(data.message);
  };

  const handleSeedData = async () => {
    if (!seedMarketId) return;
    const data = await invokeAdmin('seed_market', { market_id: seedMarketId, num_orders: parseInt(seedOrderCount) });
    if (data) toast.success(data.message);
  };

  const handleImpersonate = async (targetUserId: string) => {
    const data = await invokeAdmin('impersonate', { user_id: targetUserId });
    if (data?.user) {
      localStorage.setItem(STORAGE_KEY, data.user.id);
      toast.success(`Now impersonating ${data.user.username}. Reloading...`);
      setTimeout(() => window.location.reload(), 500);
    }
  };

  const openMarkets = markets.filter(m => m.status === 'OPEN' || m.status === 'VOTING');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Token Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Select User</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Choose a user...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input type="number" value={tokenAmount} onChange={(e) => setTokenAmount(e.target.value)} placeholder="1000" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGiveTokens} disabled={isLoading || !selectedUserId} size="sm">
              <Coins className="h-4 w-4 mr-1" /> Give Tokens
            </Button>
            <Button onClick={handleSetBalance} disabled={isLoading || !selectedUserId} size="sm" variant="outline">
              Set Balance
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <UserCog className="h-5 w-5" /> Impersonate User
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{u.username}</span>
                  {u.id === user?.id && <Badge variant="secondary" className="text-xs">You</Badge>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleImpersonate(u.id)} disabled={isLoading || u.id === user?.id}>
                  <LogIn className="h-4 w-4 mr-1" /> Switch
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> Seed Test Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Select Market</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={seedMarketId}
              onChange={(e) => setSeedMarketId(e.target.value)}
            >
              <option value="">Choose a market...</option>
              {openMarkets.map((m) => (
                <option key={m.id} value={m.id}>{m.question.substring(0, 60)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Number of Orders</Label>
            <Input type="number" value={seedOrderCount} onChange={(e) => setSeedOrderCount(e.target.value)} min="1" max="50" />
          </div>
          <Button onClick={handleSeedData} disabled={isLoading || !seedMarketId} size="sm">
            <Sparkles className="h-4 w-4 mr-1" /> Seed Orders
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RotateCcw className="h-5 w-5" /> Market Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {markets.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.question}</p>
                  <Badge variant="outline" className="text-xs mt-1">{m.status}</Badge>
                </div>
                <div className="flex gap-1 shrink-0">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" title="Reset to OPEN"><RotateCcw className="h-3.5 w-3.5" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reset Market?</AlertDialogTitle>
                        <AlertDialogDescription>This will delete all orders, trades, positions, and votes, then reset the market to OPEN status.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleResetMarket(m.id)}>Reset Market</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" title="Delete market"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Market?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete the market and ALL related data.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteMarket(m.id)} className="bg-destructive text-destructive-foreground">Delete Forever</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
