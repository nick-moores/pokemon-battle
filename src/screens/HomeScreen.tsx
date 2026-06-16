interface HomeScreenProps {
  onGoTeams: () => void;
  onGoBattle: () => void;
  onGoHistory: () => void;
  teamCount: number;
}

export function HomeScreen({ onGoTeams, onGoBattle, onGoHistory, teamCount }: HomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 p-6 text-white">
      <div className="text-center mb-12">
        <div className="text-7xl mb-4">⚡</div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">Pokemon Battle</h1>
        <p className="text-gray-400 text-lg">Family Battle Simulator</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={onGoBattle}
          disabled={teamCount < 2}
          className="w-full py-5 rounded-2xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-900"
        >
          ⚔️ Start Battle
          {teamCount < 2 && <div className="text-sm font-normal opacity-70 mt-1">Build 2 teams first</div>}
        </button>

        <button
          onClick={onGoTeams}
          className="w-full py-5 rounded-2xl bg-blue-700 hover:bg-blue-600 font-bold text-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-900"
        >
          🏆 Manage Teams
          <div className="text-sm font-normal opacity-70 mt-1">{teamCount} team{teamCount !== 1 ? 's' : ''} saved</div>
        </button>

        <button
          onClick={onGoHistory}
          className="w-full py-4 rounded-2xl bg-gray-800 hover:bg-gray-700 font-bold text-lg transition-all hover:scale-105 active:scale-95"
        >
          📜 Battle History
        </button>
      </div>

      <p className="mt-12 text-gray-600 text-sm">All data saved locally in your browser</p>
    </div>
  );
}
