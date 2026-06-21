import { useEffect, useRef, useState } from 'react';
import { BattleLogEntry, DamageCalcRecord } from '../types';

const COLORS: Record<BattleLogEntry['type'], string> = {
  move:          'text-white',
  damage:        'text-red-300',
  status:        'text-yellow-300',
  faint:         'text-red-400 font-bold',
  switch:        'text-green-300',
  effectiveness: 'text-orange-300 font-bold',
  info:          'text-gray-300',
};

function fmt(n: number, decimals = 2) {
  return n % 1 === 0 ? String(n) : n.toFixed(decimals);
}

function stageStr(stage: number) {
  if (stage === 0) return '';
  return stage > 0 ? ` (stage +${stage})` : ` (stage ${stage})`;
}

function CalcBreakdown({ c }: { c: DamageCalcRecord }) {
  const atkLabel = c.category === 'special' ? 'Sp. Atk' : 'Attack';
  const defLabel = c.category === 'special' ? 'Sp. Def' : 'Defense';
  const pct = Math.round((c.finalDamage / c.defenderMaxHp) * 100);

  const mults: { label: string; value: string; highlight?: boolean }[] = [];
  if (c.stabMult !== 1) mults.push({ label: 'STAB', value: `×${c.stabMult.toFixed(1)}`, highlight: true });
  if (c.effectiveness !== 1) {
    const label = c.effectiveness >= 4 ? '×4 super effective' : c.effectiveness >= 2 ? '×2 super effective' : c.effectiveness === 0.5 ? '×0.5 not very effective' : '×0.25 not very effective';
    mults.push({ label: 'Type', value: label, highlight: c.effectiveness >= 2 });
  }
  if (c.weatherMult !== 1) mults.push({ label: 'Weather', value: `×${c.weatherMult}`, highlight: true });
  if (c.abilityMult !== 1) mults.push({ label: 'Ability', value: `×${c.abilityMult}` });
  if (c.isCrit) mults.push({ label: 'Critical hit', value: '×1.5', highlight: true });
  mults.push({ label: 'Roll', value: `×${fmt(c.randomFactor)}` });

  return (
    <div className="mt-1.5 mb-1 bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-[11px] space-y-1.5">
      <div className="text-gray-400 font-bold border-b border-gray-800 pb-1">
        {c.attackerName}'s {c.moveName}
        <span className="ml-2 font-normal text-gray-500">
          Pwr {c.power} · {c.category === 'special' ? 'Special' : 'Physical'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-400">
        <div>{atkLabel}:</div>
        <div className="text-white">{c.atkStat}{stageStr(c.atkStage)}</div>
        <div>{defLabel}:</div>
        <div className="text-white">{c.defStat}{stageStr(c.defStage)}</div>
      </div>

      {c.abilityNote && (
        <div className="text-blue-300">⚡ {c.abilityNote}</div>
      )}

      {mults.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mults.map(m => (
            <span
              key={m.label}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                m.highlight ? 'bg-yellow-800 text-yellow-200' : 'bg-gray-800 text-gray-300'
              }`}
            >
              {m.label} {m.value}
            </span>
          ))}
        </div>
      )}

      <div className="border-t border-gray-800 pt-1 text-white font-bold">
        {c.finalDamage} damage
        <span className="ml-2 font-normal text-gray-400">
          = {pct}% of {c.defenderMaxHp} HP
        </span>
      </div>
    </div>
  );
}

function LogEntry({ entry, isOld }: { entry: BattleLogEntry; isOld?: boolean }) {
  const [open, setOpen] = useState(false);
  const hasCale = !!entry.damageCalc;

  return (
    <div className={`leading-snug transition-opacity duration-300 ${COLORS[entry.type]} ${isOld ? 'opacity-50' : 'opacity-100'}`}>
      <div className="flex items-baseline gap-1">
        <span className="flex-1">{entry.text}</span>
        {hasCale && (
          <button
            onClick={() => setOpen(o => !o)}
            className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            title="Show damage calculation"
          >
            {open ? '▲' : '?'}
          </button>
        )}
      </div>
      {open && entry.damageCalc && <CalcBreakdown c={entry.damageCalc} />}
    </div>
  );
}

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

  const recent = entries.slice(-5);
  const oldest = entries.slice(0, -5);

  return (
    <div className="border-2 border-gray-600 rounded-xl bg-gray-950 overflow-hidden">
      {expanded && oldest.length > 0 && (
        <div className="max-h-48 overflow-y-auto px-3 pt-2 pb-1 border-b border-gray-700 space-y-1">
          {oldest.map(e => (
            <LogEntry key={e.id} entry={e} isOld />
          ))}
        </div>
      )}

      <div className="px-4 py-3 space-y-1 min-h-[108px]">
        {recent.map((e, i) => (
          <LogEntry key={e.id} entry={e} isOld={i < recent.length - 1} />
        ))}
        <div ref={bottomRef} />
      </div>

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
        <LogEntry key={e.id} entry={e} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
