import { Move } from '../types';
import { TYPE_COLORS } from '../data/typeColors';
import { getTypeEffectiveness, getEffectivenessText } from '../data/typeChart';

interface MoveButtonProps {
  move: Move;
  defenderTypes?: string[];
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  currentPP?: number;
}

export function MoveButton({ move, defenderTypes, onClick, disabled, selected, currentPP }: MoveButtonProps) {
  const colors = TYPE_COLORS[move.type.toLowerCase()] ?? { bg: '#888', text: '#fff' };
  const effectiveness = defenderTypes ? getTypeEffectiveness(move.type, defenderTypes) : 1;
  const effectText = defenderTypes ? getEffectivenessText(effectiveness) : '';
  const pp = currentPP ?? move.pp;
  const ppLow = pp <= Math.ceil(move.pp / 4);
  const ppEmpty = pp === 0;

  return (
    <button
      onClick={onClick}
      disabled={disabled || ppEmpty}
      className={`
        relative w-full rounded-xl p-3 text-left transition-all duration-150 border-2
        ${disabled || ppEmpty ? 'opacity-40 cursor-not-allowed' : 'hover:scale-105 active:scale-95 cursor-pointer'}
        ${selected ? 'ring-4 ring-white ring-offset-2 ring-offset-gray-900' : ''}
      `}
      style={{
        backgroundColor: colors.bg + 'dd',
        borderColor: colors.bg,
        color: colors.text,
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="font-bold text-sm leading-tight">{move.displayName}</div>
        <div className={`text-[10px] font-bold shrink-0 ${ppEmpty ? 'text-red-300' : ppLow ? 'text-orange-300' : 'opacity-70'}`}>
          {pp}/{move.pp}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1 text-xs opacity-90">
        <span className="uppercase font-semibold">{move.type}</span>
        <span className="opacity-70">|</span>
        <span>{move.category === 'ohko' ? 'OHKO' : move.power ? `⚡ ${move.power}` : '—'}</span>
        <span className="opacity-70">|</span>
        <span className="capitalize">{move.damageClass}</span>
      </div>
      {effectText && (
        <div className={`text-[10px] mt-1 font-bold ${effectiveness >= 2 ? 'text-yellow-300' : 'text-red-300'}`}>
          {effectText}
        </div>
      )}
    </button>
  );
}
