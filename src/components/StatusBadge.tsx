import { STATUS_COLORS } from '../data/typeColors';
import { StatusCondition } from '../types';

export function StatusBadge({ status }: { status: StatusCondition }) {
  if (status === 'none') return null;
  const info = STATUS_COLORS[status];
  if (!info) return null;
  return (
    <span
      className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded text-white"
      style={{ backgroundColor: info.bg }}
    >
      {info.label}
    </span>
  );
}
