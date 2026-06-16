import { useEffect, useRef } from 'react';
import { BattleLogEntry } from '../types';

const LOG_COLORS: Record<BattleLogEntry['type'], string> = {
  move: 'text-blue-300',
  damage: 'text-red-300',
  status: 'text-yellow-300',
  faint: 'text-red-500 font-bold',
  switch: 'text-green-300',
  effectiveness: 'text-orange-300 font-bold',
  info: 'text-gray-300',
};

export function BattleLog({ entries }: { entries: BattleLogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  return (
    <div className="h-36 overflow-y-auto bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm space-y-0.5">
      {entries.slice(-50).map((entry) => (
        <div key={entry.id} className={`leading-snug ${LOG_COLORS[entry.type]}`}>
          {entry.text}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
