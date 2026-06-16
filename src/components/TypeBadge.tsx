import { TYPE_COLORS } from '../data/typeColors';

export function TypeBadge({ type, small }: { type: string; small?: boolean }) {
  const colors = TYPE_COLORS[type.toLowerCase()] ?? { bg: '#999', text: '#fff' };
  return (
    <span
      className={`inline-block rounded font-bold uppercase tracking-wider ${small ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'}`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {type}
    </span>
  );
}
