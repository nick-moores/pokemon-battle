import { useState } from 'react';
import { useTeamStore } from '../store/teamStore';
import { useBattleStore } from '../store/battleStore';
import { Team } from '../types';
import { TypeBadge } from '../components/TypeBadge';
import { fetchMove } from '../hooks/usePokeAPI';

interface BattleSetupProps {
  onBack: () => void;
  onBattleStart: () => void;
}

function TeamCard({ team, selected, onClick }: { team: Team; selected: boolean; onClick: () => void }) {
  const readyPokemon = team.pokemon.filter(p => p.selectedMoves.length > 0);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl p-4 border-2 transition-all ${
        selected
          ? 'border-blue-400 bg-blue-900/40'
          : 'border-gray-700 bg-gray-800 hover:border-gray-500'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-white text-lg">{team.name}</span>
        {selected && <span className="text-blue-400 text-sm font-bold">✓ Selected</span>}
      </div>
      <div className="flex gap-2 flex-wrap">
        {team.pokemon.map(p => (
          <div key={p.id} className="flex flex-col items-center">
            <img src={p.sprite} alt={p.displayName} className="w-10 h-10 object-contain" />
            <div className="text-[9px] text-gray-400 text-center">{p.displayName}</div>
            {p.selectedMoves.length === 0 && (
              <div className="text-[9px] text-red-400">no moves</div>
            )}
          </div>
        ))}
      </div>
      {readyPokemon.length < team.pokemon.length && (
        <p className="text-yellow-400 text-xs mt-2">
          ⚠ {team.pokemon.length - readyPokemon.length} Pokemon missing moves
        </p>
      )}
    </button>
  );
}

export function BattleSetupScreen({ onBack, onBattleStart }: BattleSetupProps) {
  const { teams } = useTeamStore();
  const { startBattle } = useBattleStore();
  const [team1Id, setTeam1Id] = useState<string | null>(null);
  const [team2Id, setTeam2Id] = useState<string | null>(null);

  const team1 = teams.find(t => t.id === team1Id);
  const team2 = teams.find(t => t.id === team2Id);

  const canStart = team1 && team2 && team1.id !== team2.id &&
    team1.pokemon.length > 0 && team2.pokemon.length > 0;

  const [hydrating, setHydrating] = useState(false);

  const begin = async () => {
    if (!team1 || !team2) return;
    setHydrating(true);
    const hydrateTeam = async (t: Team): Promise<Team> => ({
      ...t,
      pokemon: await Promise.all(t.pokemon.map(async p => ({
        ...p,
        // Always re-fetch moves so statChanges is current; in-memory cache makes this instant
        selectedMoves: await Promise.all(
          p.selectedMoves.map(m => fetchMove(m.name).then(fresh => fresh ?? m))
        ),
      }))),
    });
    const [h1, h2] = await Promise.all([hydrateTeam(team1), hydrateTeam(team2)]);
    startBattle(h1, h2);
    onBattleStart();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xl">←</button>
          <h2 className="text-2xl font-bold">Choose Teams</h2>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Team 1 (Player 1)</h3>
          <div className="space-y-2">
            {teams.map(t => (
              <TeamCard
                key={t.id}
                team={t}
                selected={team1Id === t.id}
                onClick={() => setTeam1Id(t.id === team1Id ? null : t.id)}
              />
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Team 2 (Player 2)</h3>
          <div className="space-y-2">
            {teams.map(t => (
              <TeamCard
                key={t.id}
                team={t}
                selected={team2Id === t.id}
                onClick={() => setTeam2Id(t.id === team2Id ? null : t.id)}
              />
            ))}
          </div>
        </div>

        {team1Id === team2Id && team1Id !== null && (
          <p className="text-red-400 text-sm mb-4 text-center">Teams must be different!</p>
        )}

        <button
          onClick={begin}
          disabled={!canStart || hydrating}
          className="w-full py-5 rounded-2xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-xl transition-all hover:scale-105 active:scale-95"
        >
          {hydrating ? 'Loading moves…' : '⚔️ Battle!'}
        </button>
      </div>
    </div>
  );
}
