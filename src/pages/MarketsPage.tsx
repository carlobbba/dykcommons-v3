import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLeague } from '@/contexts/LeagueContext';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type Market = Tables<'markets'>;
type Trade = Tables<'trades'>;

interface MarketWithProbability extends Market {
  probability: number;
}

export function MarketsPage() {
  const { user } = useAuth();
  const { currentLeague } = useLeague();
  const [markets, setMarkets] = useState<MarketWithProbability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDate, setNewDate] = useState<Date | undefined>();
  const [newHour, setNewHour] = useState('12');
  const [newMinute, setNewMinute] = useState('00');
  const [isCreating, setIsCreating] = useState(false);

  const fetchMarkets = async () => {
    if (!currentLeague) return;

    let query = supabase
      .from('markets')
      .select('*')
      .in('status', ['OPEN', 'VOTING'])
      .eq('league_id', currentLeague.id)
      .order('created_at', { ascending: false });

    const { data: marketsData, error: marketsError } = await query;

    if (marketsError || !marketsData) {
      console.error('Error fetching markets:', marketsError);
      setIsLoading(false);
      return;
    }

    const marketIds = marketsData.map(m => m.id);
    const { data: tradesData } = marketIds.length > 0
      ? await supabase
          .from('trades')
          .select('*')
          .in('market_id', marketIds)
          .order('created_at', { ascending: false })
      : { data: [] };

    const lastTradeByMarket: Record<string, Trade> = {};
    tradesData?.forEach(trade => {
      if (!lastTradeByMarket[trade.market_id]) {
        lastTradeByMarket[trade.market_id] = trade;
      }
    });

    const marketsWithProbability: MarketWithProbability[] = marketsData.map(market => ({
      ...market,
      probability: lastTradeByMarket[market.id]?.price ?? 50,
    }));

    setMarkets(marketsWithProbability);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchMarkets();
    const interval = setInterval(fetchMarkets, 5000);
    return () => clearInterval(interval);
  }, [currentLeague]);

  const handleCreateMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !user || !newDate || !currentLeague) return;

    setIsCreating(true);

    const closesAt = new Date(newDate);
    closesAt.setHours(parseInt(newHour), parseInt(newMinute), 0, 0);

    const { error } = await supabase
      .from('markets')
      .insert({
        question: newTitle.trim(),
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        closes_at: closesAt.toISOString(),
        created_by: user.id,
        league_id: currentLeague.id,
      } as any);

    if (!error) {
      setNewTitle('');
      setNewDescription('');
      setNewDate(undefined);
      setNewHour('12');
      setNewMinute('00');
      setIsDialogOpen(false);
      fetchMarkets();
    }

    setIsCreating(false);
  };

  const getStatusBadge = (status: Market['status']) => {
    switch (status) {
      case 'OPEN':
        return <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">Open</Badge>;
      case 'VOTING':
        return <Badge variant="default" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Voting</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Markets</h1>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Market
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create a New Market</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateMarket} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title / Question</Label>
                  <Input
                    id="title"
                    placeholder="Will X happen by Y date?"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    disabled={isCreating}
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Resolution Conditions</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe in detail how this market should be resolved..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    disabled={isCreating}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Deadline</Label>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "flex-1 justify-start text-left font-normal",
                            !newDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {newDate ? format(newDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={newDate}
                          onSelect={setNewDate}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>

                    <Select value={newHour} onValueChange={setNewHour}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {hours.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="flex items-center text-muted-foreground">:</span>
                    <Select value={newMinute} onValueChange={setNewMinute}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {minutes.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isCreating || !newTitle.trim() || !newDate}>
                  {isCreating ? 'Creating...' : 'Create Market'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-12">
            Loading markets...
          </div>
        ) : markets.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No active markets yet.</p>
              <p className="text-sm text-muted-foreground mt-1">Create the first one!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {markets.map((market) => (
              <Link key={market.id} to={`/market/${market.id}`}>
                <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-medium leading-snug">
                        {market.question}
                      </CardTitle>
                      {getStatusBadge(market.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${market.probability}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-lg font-semibold tabular-nums">
                        {market.probability}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Implied probability
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
