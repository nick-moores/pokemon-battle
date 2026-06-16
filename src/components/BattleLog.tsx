import { useEffect, useRef, useState } from 'react';
import { BattleLogEntry } from '../types';

const COLORS: Record<BattleLogEntry['type'], string> = {
  move:          'text-white',
  damage:        'text-red-300',
  status:        'text-yellow-300',
  faint:         'text-red-400 font-bold',
  switch:        'text-green-300',
  effectiveness: 'text-orange-300 font-bold',
  info:          'text-gray-300',
};

// Always-visible game-style text box showing the last few messages
export function BattleTextBox({ entries }: { entries: BattleLogEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(entries.length);

  useEffect(() => {
    if (entries.length !== prevLen.current) {
      prevLen.current = entries.length;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries.length]);

  const recent = entries.slice(-3);
  const oldest = entries.slice(0, -3);

  return (
    <div className="border-2 border-gray-600 rounded-xl bg-gray-950 overflow-hidden">
      {/* Full history (expandable) */}
      {expanded && oldest.length > 0 && (
        <div className="max-h-32 overflow-y-auto px-3 pt-2 pb-1 border-b border-gray-700 space-y-0.5">
          {oldest.map(e => (
            <div key={e.id} className={`text-xs leading-snug opacity-60 ${COLORS[e.type]}`}>
              {e.text}
            </div>
          ))}
        </div>
      )}

      {/* Recent messages — always visible */}
      <div className="px-4 py-3 space-y-1 min-h-[72px]">
        {recent.map((e, i) => (
          <div
            key={e.id}
            className={`text-sm leading-snug transition-opacity duration-300 ${COLORS[e.type]} ${
              i < recent.length - 1 ? 'opacity-50' : 'opacity-100'
            }`}
          >
            {e.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* History toggle */}
      {entries.length > 3 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full text-[10px] text-gray-600 hover:text-gray-400 py-1 border-t border-gray-800 text-center transition-colors"
        >
          {expanded ? '▲ hide history' : `▼ ${entries.length - 3} earlier messages`}
        </button>
      )}
    </div>
  );
}

// Keep the old BattleLog export for the game-over screen
export function BattleLog({ entries }: { entries: BattleLogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);
  return (
    <div className="h-48 overflow-y-auto bg-gray-900 border border-gray-700 rounded-xl p-3 text-xs space-y-0.5">
      {entries.map(e => (
        <div key={e.id} className={`leading-snug ${COLORS[e.type]}`}>{e.text}</div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
