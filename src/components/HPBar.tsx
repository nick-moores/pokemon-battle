interface HPBarProps {
  current: number;
  max: number;
  showNumbers?: boolean;
}

export function HPBar({ current, max, showNumbers }: HPBarProps) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color = pct > 50 ? '#4ade80' : pct > 20 ? '#facc15' : '#f87171';

  return (
    <div className="w-full">
      {showNumbers && (
        <div className="flex justify-between text-xs font-bold mb-1 text-gray-300">
          <span>HP</span>
          <span>{current} / {max}</span>
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
          {current}/{max}
        </div>
      )}
    </div>
  );
}
