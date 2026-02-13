import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Clock, AlertTriangle } from 'lucide-react';

interface CountdownTimerProps {
  closesAt: string;
  marketId: string;
  status: string;
}

export function CountdownTimer({ closesAt, marketId, status }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [isGracePeriod, setIsGracePeriod] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date().getTime();
      const deadline = new Date(closesAt).getTime();
      const diff = deadline - now;

      if (diff > 0) {
        // Before deadline
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        if (days > 0) {
          setTimeLeft(`${days}d ${hours}h ${minutes}m`);
        } else if (hours > 0) {
          setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
        } else {
          setTimeLeft(`${minutes}m ${seconds}s`);
        }
        setIsExpired(false);
        setIsGracePeriod(false);
      } else {
        // After deadline - check grace period (1 hour)
        const graceEnd = deadline + (60 * 60 * 1000); // 1 hour grace
        const graceDiff = graceEnd - now;

        if (graceDiff > 0 && status === 'OPEN') {
          // In grace period
          const minutes = Math.floor((graceDiff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((graceDiff % (1000 * 60)) / 1000);
          setTimeLeft(`${minutes}m ${seconds}s`);
          setIsGracePeriod(true);
          setIsExpired(false);
        } else {
          // Grace period expired
          setTimeLeft('Expired');
          setIsExpired(true);
          setIsGracePeriod(false);
          
          // Trigger expiry check
          if (status === 'OPEN') {
            supabase.functions.invoke('check-market-expiry', {
              body: { market_id: marketId },
            }).catch(() => {});
          }
        }
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [closesAt, marketId, status]);

  if (isExpired) {
    return (
      <div className="flex items-center gap-2 text-red-500 text-sm font-medium">
        <AlertTriangle className="h-4 w-4" />
        <span>Market expired — awaiting resolution</span>
      </div>
    );
  }

  if (isGracePeriod) {
    return (
      <div className="flex items-center gap-2 text-yellow-500 text-sm font-medium">
        <AlertTriangle className="h-4 w-4" />
        <span>Grace period: {timeLeft} remaining</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <Clock className="h-4 w-4" />
      <span>Closes in {timeLeft}</span>
    </div>
  );
}
