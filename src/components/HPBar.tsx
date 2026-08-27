import { useState, useEffect, useRef } from 'react';

interface HPBarProps {
  current: number;
  max: number;
  showNumbers?: boolean;
}

export function HPBar({ current, max, showNumbers }: HPBarProps) {
  const [displayed, setDisplayed] = useState(current);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = displayed;
    const end = current;
    if (start === end) return;

    const duration = Math.min(600, Math.abs(end - start) * 4);
    const startTime = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      setDisplayed(Math.round(start + (end - start) * t));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [current]);

  const pct = Math.max(0, Math.min(100, (displayed / max) * 100));
  const color = pct > 50 ? '#4ade80' : pct > 20 ? '#facc15' : '#f87171';

  return (
    <div className="w-full">
      {showNumbers && (
        <div className="flex justify-between text-xs font-bold mb-1 text-gray-300">
          <span>HP</span>
          <span>{displayed} / {max}</span>
        </div>
      )}
      <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden border border-gray-600">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {!showNumbers && (
        <div className="text-right text-xs font-bold mt-0.5" style={{ color }}>
          {displayed}/{max}
        </div>
      )}
    </div>
  );
}
