import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLeague } from '@/contexts/LeagueContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

type Market = Tables<'markets'>;
type Order = Tables<'orders'>;
type Position = Tables<'positions'>;

interface TradingPanelProps {
  market: Market;
  position: Position | null;
  orders: Order[];
  onOrderPlaced: () => void;
}

export function TradingPanel({ market, position, orders, onOrderPlaced }: TradingPanelProps) {
  const { user, isAdmin, refreshUser } = useAuth();
  const { leagueBalance, currentLeague, refreshLeagueBalance } = useLeague();
  const [side, setSide] = useState<Enums<'order_side'>>('YES');
  const [price, setPrice] = useState(50);
  const [quantity, setQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [sellSide, setSellSide] = useState<'YES' | 'NO'>('YES');
  const [sellPrice, setSellPrice] = useState(50);
  const [sellQuantity, setSellQuantity] = useState(1);
  const [isSelling, setIsSelling] = useState(false);

  const cost = side === 'YES' ? price * quantity : (100 - price) * quantity;
  const canAfford = user && (isAdmin || cost <= leagueBalance);
  const isMarketOpen = market.status === 'OPEN';

  const openSellModal = (sideToSell: 'YES' | 'NO') => {
    setSellSide(sideToSell);
    setSellPrice(50);
    const maxShares = sideToSell === 'YES' ? position?.yes_shares || 0 : position?.no_shares || 0;
    setSellQuantity(Math.min(1, maxShares));
    setSellModalOpen(true);
  };

  const handleSell = async () => {
    if (!user || !position || !currentLeague) return;

    const maxShares = sellSide === 'YES' ? position.yes_shares : position.no_shares;
    if (sellQuantity > maxShares || sellQuantity < 1) {
      toast.error('Invalid quantity');
      return;
    }

    setIsSelling(true);

    try {
      const priceToSend = sellSide === 'YES' ? sellPrice : (100 - sellPrice);

      const response = await supabase.functions.invoke('sell-position', {
        body: {
          market_id: market.id,
          user_id: user.id,
          side_to_sell: sellSide,
          price: priceToSend,
          quantity: sellQuantity,
          league_id: currentLeague.id,
        },
      });

      if (response.error) {
        toast.error(response.error.message || 'Failed to place sell order');
      } else {
        toast.success(`Sell order placed: ${sellQuantity} ${sellSide} @ ${sellPrice}¢`);
        setSellModalOpen(false);
        onOrderPlaced();
        refreshLeagueBalance(user.id);
      }
    } catch {
      toast.error('Failed to place sell order');
    }

    setIsSelling(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canAfford || !isMarketOpen || !currentLeague) return;

    setIsSubmitting(true);

    try {
      const response = await supabase.functions.invoke('place-order', {
        body: {
          market_id: market.id,
          user_id: user.id,
          side,
          price,
          quantity,
          league_id: currentLeague.id,
        },
      });

      if (response.error) {
        toast.error(response.error.message || 'Failed to place order');
      } else {
        toast.success(`Order placed: ${quantity} ${side} @ ${price}¢`);
        setQuantity(1);
        onOrderPlaced();
        refreshLeagueBalance(user.id);
      }
    } catch {
      toast.error('Failed to place order');
    }

    setIsSubmitting(false);
  };

  const handleCancelOrder = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || !user) return;

    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (error) {
      toast.error('Failed to cancel order');
      return;
    }

    // If it's a sell order, return the escrowed shares
    if (order.is_sell_order && position) {
      const posUpdate = order.side === 'YES'
        ? { yes_shares: (position.yes_shares || 0) + order.remaining_quantity }
        : { no_shares: (position.no_shares || 0) + order.remaining_quantity };
      await supabase.from('positions').update(posUpdate).eq('id', position.id);
    }

    toast.success('Order cancelled');
    onOrderPlaced();
  };

  const getDisplayPrice = (order: Order) => {
    if (order.is_sell_order) {
      return order.side === 'YES' ? order.price : (100 - order.price);
    }
    return order.side === 'YES' ? order.price : (100 - order.price);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Place Order</CardTitle>
        </CardHeader>
        <CardContent>
          {!isMarketOpen ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Trading is closed for this market.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={side === 'YES' ? 'default' : 'outline'}
                  className={cn(side === 'YES' && 'bg-emerald-600 hover:bg-emerald-700')}
                  onClick={() => setSide('YES')}
                >
                  YES
                </Button>
                <Button
                  type="button"
                  variant={side === 'NO' ? 'default' : 'outline'}
                  className={cn(side === 'NO' && 'bg-rose-600 hover:bg-rose-700')}
                  onClick={() => setSide('NO')}
                >
                  NO
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Price</Label>
                  <span className="text-sm font-medium">{price}¢</span>
                </div>
                <Slider value={[price]} onValueChange={([val]) => setPrice(val)} min={1} max={99} step={1} />
                <p className="text-xs text-muted-foreground">
                  {side === 'YES'
                    ? `You pay ${price}¢ per share, win 100¢ if YES`
                    : `You pay ${100 - price}¢ per share, win 100¢ if NO`}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              <div className="p-3 bg-muted rounded-md space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Total Cost</span>
                  <span className="font-medium">{cost} tokens</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Your Balance</span>
                  <span>{isAdmin ? '∞' : leagueBalance.toLocaleString()}</span>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={!canAfford || isSubmitting}>
                {isSubmitting
                  ? 'Placing Order...'
                  : !canAfford
                    ? 'Insufficient Balance'
                    : `Buy ${quantity} ${side} @ ${price}¢`}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Position</CardTitle>
        </CardHeader>
        <CardContent>
          {position && (position.yes_shares > 0 || position.no_shares > 0) ? (
            <div className="space-y-2">
              {position.yes_shares > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-600 dark:text-emerald-400">YES shares</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{position.yes_shares}</span>
                    {isMarketOpen && (
                      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => openSellModal('YES')}>
                        Sell
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {position.no_shares > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-rose-600 dark:text-rose-400">NO shares</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{position.no_shares}</span>
                    {isMarketOpen && (
                      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => openSellModal('NO')}>
                        Sell
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center">No position in this market</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Open Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center">No open orders</p>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-2 border rounded-md text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={order.is_sell_order ? 'secondary' : 'outline'} className="text-xs">
                      {order.is_sell_order ? 'SELL' : 'BUY'}
                    </Badge>
                    <span className={cn("font-medium", order.side === 'YES' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                      {order.side}
                    </span>
                    <span className="text-muted-foreground">{order.remaining_quantity} @ {getDisplayPrice(order)}¢</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCancelOrder(order.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={sellModalOpen} onOpenChange={setSellModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sell {sellSide} Shares</DialogTitle>
            <DialogDescription>
              Place a sell order for your {sellSide} shares. You have {sellSide === 'YES' ? position?.yes_shares || 0 : position?.no_shares || 0} shares.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Sell Price</Label>
                <span className="text-sm font-medium">{sellPrice}¢ per share</span>
              </div>
              <Slider value={[sellPrice]} onValueChange={([val]) => setSellPrice(val)} min={1} max={99} step={1} />
              <p className="text-xs text-muted-foreground">You receive {sellPrice}¢ per share when matched</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sellQuantity">Quantity</Label>
              <Input
                id="sellQuantity"
                type="number"
                min={1}
                max={sellSide === 'YES' ? position?.yes_shares || 1 : position?.no_shares || 1}
                value={sellQuantity}
                onChange={(e) => setSellQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className="p-3 bg-muted rounded-md text-sm">
              <div className="flex justify-between">
                <span>Total proceeds if filled</span>
                <span className="font-medium">{sellPrice * sellQuantity} tokens</span>
              </div>
            </div>
            <Button className="w-full" onClick={handleSell} disabled={isSelling}>
              {isSelling ? 'Placing Order...' : `Sell ${sellQuantity} ${sellSide} @ ${sellPrice}¢`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
