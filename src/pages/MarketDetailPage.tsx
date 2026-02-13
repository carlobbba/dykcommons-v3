import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/Header';
import { OrderBook } from '@/components/OrderBook';
import { TradingPanel } from '@/components/TradingPanel';
import { ProbabilityChart } from '@/components/ProbabilityChart';
import { CountdownTimer } from '@/components/CountdownTimer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Flag, XCircle, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Market = Tables<'markets'>;
type Order = Tables<'orders'>;
type Trade = Tables<'trades'>;
type Position = Tables<'positions'>;

export function MarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, refreshUser, isAdmin } = useAuth();
  
  const [market, setMarket] = useState<Market | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const fetchData = useCallback(async () => {
    if (!id || !user) return;

    const { data: marketData } = await supabase
      .from('markets')
      .select('*')
      .eq('id', id)
      .single();

    if (!marketData) {
      navigate('/');
      return;
    }

    setMarket(marketData);

    const [ordersResult, tradesResult, positionResult] = await Promise.all([
      supabase
        .from('orders')
        .select('*')
        .eq('market_id', id)
        .gt('remaining_quantity', 0)
        .order('price', { ascending: false }),
      supabase
        .from('trades')
        .select('*')
        .eq('market_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('positions')
        .select('*')
        .eq('market_id', id)
        .eq('user_id', user.id)
        .single(),
    ]);

    setOrders(ordersResult.data || []);
    setTrades(tradesResult.data || []);
    setPosition(positionResult.data || null);
    setIsLoading(false);
  }, [id, user, navigate]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Check for market expiry on load
  useEffect(() => {
    if (!id) return;
    supabase.functions.invoke('check-market-expiry', {
      body: { market_id: id },
    }).catch(() => {});
  }, [id]);

  const handleReportOutcome = async () => {
    if (!market || !user) return;
    
    setIsReporting(true);

    let evidenceUrl: string | null = null;

    // Upload evidence file if provided
    if (evidenceFile) {
      const fileExt = evidenceFile.name.split('.').pop();
      const filePath = `${market.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('evidence')
        .upload(filePath, evidenceFile);

      if (uploadError) {
        toast.error('Failed to upload evidence file');
        setIsReporting(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('evidence')
        .getPublicUrl(filePath);

      evidenceUrl = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from('markets')
      .update({ 
        status: 'VOTING',
        reported_at: new Date().toISOString(),
        reported_by: user.id,
        evidence_url: evidenceUrl,
      } as any)
      .eq('id', market.id)
      .eq('status', 'OPEN')
      .select();

    if (error) {
      toast.error('Failed to report outcome');
    } else if (!data || data.length === 0) {
      toast.info('Market has already been moved to voting by another user.');
      setIsReportDialogOpen(false);
      fetchData();
    } else {
      toast.success('Market moved to voting. Outcome reported as YES.');
      setIsReportDialogOpen(false);
      setEvidenceFile(null);
      fetchData();
    }

    setIsReporting(false);
  };

  const handleCancelMarket = async () => {
    if (!market || !user) return;
    
    setIsCancelling(true);

    const { error } = await supabase.functions.invoke('cancel-market', {
      body: { market_id: market.id, admin_user_id: user.id },
    });

    if (error) {
      toast.error('Failed to cancel market');
    } else {
      toast.success('Market cancelled. All orders have been refunded.');
      setIsCancelDialogOpen(false);
      fetchData();
    }

    setIsCancelling(false);
  };

  const getStatusBadge = (status: Market['status']) => {
    switch (status) {
      case 'OPEN':
        return <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">Open</Badge>;
      case 'VOTING':
        return <Badge variant="default" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Voting</Badge>;
      case 'RESOLVED':
        return <Badge variant="secondary">Resolved</Badge>;
      case 'CANCELLED':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">Loading...</div>
        </main>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">Market not found</div>
        </main>
      </div>
    );
  }

  const currentProbability = trades.length > 0 
    ? trades[trades.length - 1].price 
    : 50;

  const marketAny = market as any;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Back button and header */}
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Markets
          </Button>
          
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {getStatusBadge(market.status)}
                <span className="text-2xl font-bold tabular-nums">{currentProbability}%</span>
              </div>
              <h1 className="text-xl font-semibold">{market.question}</h1>
              {marketAny.description && (
                <p className="text-sm text-muted-foreground mt-2">{marketAny.description}</p>
              )}
              
              {/* Countdown Timer */}
              {marketAny.closes_at && (market.status === 'OPEN' || market.status === 'VOTING') && (
                <div className="mt-3">
                  <CountdownTimer 
                    closesAt={marketAny.closes_at} 
                    marketId={market.id}
                    status={market.status}
                  />
                </div>
              )}
            </div>
            
            {market.status === 'OPEN' && (
              <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
                <Button variant="outline" onClick={() => setIsReportDialogOpen(true)}>
                  <Flag className="h-4 w-4 mr-2" />
                  Report YES Outcome
                </Button>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Report YES Outcome</DialogTitle>
                    <DialogDescription>
                      Report that this market's condition has been met (YES). This will move the market to voting for verification.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 mt-4">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium">{market.question}</p>
                      {marketAny.description && (
                        <p className="text-xs text-muted-foreground mt-1">{marketAny.description}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="evidence">Evidence (optional)</Label>
                      <Input
                        id="evidence"
                        type="file"
                        accept="image/*,.pdf,.doc,.docx"
                        onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                        disabled={isReporting}
                      />
                      <p className="text-xs text-muted-foreground">
                        Upload an image, PDF, or document as evidence for voters.
                      </p>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      onClick={handleReportOutcome}
                      disabled={isReporting}
                      className="w-full"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {isReporting ? 'Reporting...' : 'Report YES & Start Voting'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {isAdmin && (market.status === 'OPEN' || market.status === 'VOTING') && (
              <>
                <Button 
                  variant="destructive" 
                  onClick={() => setIsCancelDialogOpen(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel Market
                </Button>

                <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel Market?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will cancel the market and refund all open orders. Positions will not be paid out. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Market Open</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleCancelMarket}
                        disabled={isCancelling}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isCancelling ? 'Cancelling...' : 'Cancel & Refund'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>

        {/* Main content grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column - Chart and Order Book */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Probability Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ProbabilityChart trades={trades} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Order Book</CardTitle>
              </CardHeader>
              <CardContent>
                <OrderBook orders={orders} userId={user?.id} />
              </CardContent>
            </Card>
          </div>

          {/* Right column - Trading Panel */}
          <div className="space-y-6">
            <TradingPanel 
              market={market}
              position={position}
              orders={orders.filter(o => o.user_id === user?.id)}
              onOrderPlaced={() => {
                fetchData();
                refreshUser();
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
