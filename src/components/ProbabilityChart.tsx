import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import type { Tables } from '@/integrations/supabase/types';
import { format } from 'date-fns';

type Trade = Tables<'trades'>;

interface ProbabilityChartProps {
  trades: Trade[];
}

export function ProbabilityChart({ trades }: ProbabilityChartProps) {
  if (trades.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-muted-foreground">
        No trades yet. Probability starts at 50%.
      </div>
    );
  }

  // Build chart data from trades
  const chartData = trades.map((trade) => ({
    time: new Date(trade.created_at).getTime(),
    probability: trade.price,
    formattedTime: format(new Date(trade.created_at), 'MMM d, HH:mm'),
  }));

  // Add starting point at 50% if we have trades
  if (chartData.length > 0) {
    const firstTrade = chartData[0];
    chartData.unshift({
      time: firstTrade.time - 60000, // 1 minute before first trade
      probability: 50,
      formattedTime: 'Start',
    });
  }

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <XAxis 
            dataKey="formattedTime" 
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            domain={[0, 100]} 
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={30}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--background))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              fontSize: '12px',
            }}
            formatter={(value: number) => [`${value}%`, 'Probability']}
            labelFormatter={(label) => label}
          />
          <Line
            type="stepAfter"
            dataKey="probability"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
