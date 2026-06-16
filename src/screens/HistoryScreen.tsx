import { useBattleStore } from '../store/battleStore';

interface HistoryScreenProps {
  onBack: () => void;
}

export function HistoryScreen({ onBack }: HistoryScreenProps) {
  const { history } = useBattleStore();

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xl">←</button>
          <h2 className="text-2xl font-bold">Battle History</h2>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <div className="text-5xl mb-3">📜</div>
            <div>No battles yet</div>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map(record => (
              <div key={record.id} className="bg-gray-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-yellow-400 font-bold">🏆 {record.winner}</span>
                  <span className="text-gray-500 text-xs">
                    {new Date(record.date).toLocaleDateString()} · {record.turns} turns
                  </span>
                </div>
                <div className="text-gray-300 text-sm">
                  {record.team1Name} <span className="text-gray-600">vs</span> {record.team2Name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
