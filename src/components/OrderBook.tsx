import type { Tables } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';

type Order = Tables<'orders'>;

interface OrderBookProps {
  orders: Order[];
  userId?: string;
}

interface AggregatedOrder {
  price: number;
  quantity: number;
  isOwn: boolean;
  isSell: boolean;
}

export function OrderBook({ orders, userId }: OrderBookProps) {
  const yesOrders = orders.filter(o => o.side === 'YES');
  const noOrders = orders.filter(o => o.side === 'NO');

  const aggregateOrders = (orderList: Order[], isSell: boolean): AggregatedOrder[] => {
    const filtered = orderList.filter(o => o.is_sell_order === isSell);
    const byPrice: Record<number, { quantity: number; isOwn: boolean }> = {};

    filtered.forEach(order => {
      if (!byPrice[order.price]) {
        byPrice[order.price] = { quantity: 0, isOwn: false };
      }
      byPrice[order.price].quantity += order.remaining_quantity;
      if (order.user_id === userId) {
        byPrice[order.price].isOwn = true;
      }
    });

    return Object.entries(byPrice)
      .map(([price, data]) => ({
        price: Number(price),
        quantity: data.quantity,
        isOwn: data.isOwn,
        isSell,
      }))
      .sort((a, b) => isSell ? a.price - b.price : b.price - a.price);
  };

  const yesAsks = aggregateOrders(yesOrders, true);
  const yesBids = aggregateOrders(yesOrders, false);
  const noAsks = aggregateOrders(noOrders, true);
  const noBids = aggregateOrders(noOrders, false);

  const maxQuantity = Math.max(
    ...yesAsks.map(o => o.quantity),
    ...yesBids.map(o => o.quantity),
    ...noAsks.map(o => o.quantity),
    ...noBids.map(o => o.quantity),
    1
  );

  const renderRow = (order: AggregatedOrder, side: 'YES' | 'NO') => {
    const widthPercent = (order.quantity / maxQuantity) * 100;
    const isYes = side === 'YES';

    return (
      <div
        key={`${side}-${order.isSell ? 'sell' : 'buy'}-${order.price}`}
        className={cn(
          "relative flex items-center justify-between px-2 py-1 text-sm",
          order.isOwn && "font-medium"
        )}
      >
        <div
          className={cn(
            "absolute inset-0 opacity-15",
            order.isSell
              ? "bg-amber-500"
              : isYes ? "bg-emerald-500" : "bg-rose-500"
          )}
          style={{
            width: `${widthPercent}%`,
            [isYes ? 'left' : 'right']: 0,
          }}
        />
        <span className={cn(
          "relative z-10",
          order.isSell
            ? "text-amber-600 dark:text-amber-400"
            : isYes ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
        )}>
          {order.price}¢
        </span>
        <span className="relative z-10 text-muted-foreground tabular-nums">
          {order.quantity}
          {order.isOwn && <span className="ml-1 text-xs">•</span>}
        </span>
      </div>
    );
  };

  const renderSideBook = (side: 'YES' | 'NO', asks: AggregatedOrder[], bids: AggregatedOrder[]) => (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
        {side}
      </div>
      <div className="border rounded-md overflow-hidden">
        {/* Asks (sell orders) - shown at top, sorted low to high */}
        {asks.length > 0 && (
          <>
            <div className="px-2 py-0.5 bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider flex justify-between">
              <span>Asks</span>
              <span>Qty</span>
            </div>
            {asks.map(order => renderRow(order, side))}
          </>
        )}

        {/* Spread divider */}
        {(asks.length > 0 || bids.length > 0) && (
          <div className="border-t border-b border-dashed px-2 py-0.5 text-[10px] text-muted-foreground text-center">
            {asks.length > 0 && bids.length > 0
              ? `spread: ${Math.abs((asks[asks.length - 1]?.price ?? 0) - (bids[0]?.price ?? 0))}¢`
              : '—'
            }
          </div>
        )}

        {/* Bids (buy orders) - shown at bottom, sorted high to low */}
        {bids.length > 0 && (
          <>
            <div className="px-2 py-0.5 bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider flex justify-between">
              <span>Bids</span>
              <span>Qty</span>
            </div>
            {bids.map(order => renderRow(order, side))}
          </>
        )}

        {asks.length === 0 && bids.length === 0 && (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No orders
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <h4 className="text-sm font-semibold mb-3">Order Book</h4>
      <div className="grid grid-cols-2 gap-4">
        {renderSideBook('YES', yesAsks, yesBids)}
        {renderSideBook('NO', noAsks, noBids)}
      </div>
    </div>
  );
}
