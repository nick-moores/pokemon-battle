import { useState } from 'react';
import { useTeamStore } from '../store/teamStore';
import { useBattleStore } from '../store/battleStore';
import { Team, TeamPokemon, Move } from '../types';
import { TypeBadge } from '../components/TypeBadge';
import { fetchMove, fetchPokemon } from '../hooks/usePokeAPI';

interface BattleSetupProps {
  onBack: () => void;
  onBattleStart: () => void;
}

// Gen 1–3 pool (IDs 1–386). Avoids weird variants while keeping classic mons.
const POKEMON_POOL_SIZE = 386;

function pickRandomIds(count: number): number[] {
  const ids: number[] = [];
  while (ids.length < count) {
    const id = Math.floor(Math.random() * POKEMON_POOL_SIZE) + 1;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

async function generateRandomTeam(): Promise<Team> {
  const ids = pickRandomIds(3);
  const bases = (await Promise.all(ids.map(id => fetchPokemon(id)))).filter(Boolean) as ReturnType<typeof Array.prototype.filter> extends (infer T)[] ? T[] : never[];

  const pokemon: TeamPokemon[] = [];
  for (const base of bases as Awaited<ReturnType<typeof fetchPokemon>>[]) {
    if (!base) continue;
    const shuffled = [...base.availableMoveNames].sort(() => Math.random() - 0.5);
    const moveResults = (await Promise.all(shuffled.slice(0, 8).map(n => fetchMove(n)))).filter(Boolean) as Move[];
    const selectedMoves = moveResults.slice(0, 4);
    const ability = base.availableAbilities[Math.floor(Math.random() * base.availableAbilities.length)] ?? '';
    pokemon.push({ ...base, selectedMoves, ability });
  }

  const name = pokemon.map(p => p.displayName).join(', ');
  return { id: crypto.randomUUID(), name, pokemon };
}

function TeamCard({ team, selected, onClick }: { team: Team; selected: boolean; onClick: () => void }) {
  const readyPokemon = team.pokemon.filter(p => p.selectedMoves.length > 0);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl p-4 border-2 transition-all ${
        selected ? 'border-blue-400 bg-blue-900/40' : 'border-gray-700 bg-gray-800 hover:border-gray-500'
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
            {p.selectedMoves.length === 0 && <div className="text-[9px] text-red-400">no moves</div>}
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

function RandomTeamCard({
  team,
  onReroll,
  onSave,
  rerolling,
}: {
  team: Team;
  onReroll: () => void;
  onSave: () => void;
  rerolling: boolean;
}) {
  return (
    <div className="rounded-2xl p-4 border-2 border-green-500 bg-green-900/20">
      <div className="flex items-center justify-between mb-3">
        <span className="text-green-400 text-sm font-bold">✓ Random Team Selected</span>
        <div className="flex gap-2">
          <button
            onClick={onReroll}
            disabled={rerolling}
            className="text-xs px-2 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300"
          >
            {rerolling ? '…' : '🔄 Re-roll'}
          </button>
          <button
            onClick={onSave}
            className="text-xs px-2 py-1 rounded-lg bg-blue-700 hover:bg-blue-600 text-white"
          >
            💾 Save
          </button>
        </div>
      </div>
      <div className="flex gap-3 flex-wrap">
        {team.pokemon.map(p => (
          <div key={p.id} className="flex flex-col items-center">
            <img src={p.sprite} alt={p.displayName} className="w-12 h-12 object-contain" />
            <div className="text-[9px] text-white font-bold text-center">{p.displayName}</div>
            <div className="flex gap-0.5 mt-0.5">
              {p.types.map(t => <TypeBadge key={t} type={t} small />)}
            </div>
            <div className="mt-1 space-y-0.5">
              {p.selectedMoves.map(m => (
                <div key={m.id} className="text-[8px] text-gray-400 text-center leading-tight">{m.displayName}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BattleSetupScreen({ onBack, onBattleStart }: BattleSetupProps) {
  const { teams, createTeam, addPokemonToTeam } = useTeamStore();
  const { startBattle } = useBattleStore();

  const [team1Id, setTeam1Id] = useState<string | null>(null);
  const [team2Id, setTeam2Id] = useState<string | null>(null);
  const [randomTeam1, setRandomTeam1] = useState<Team | null>(null);
  const [randomTeam2, setRandomTeam2] = useState<Team | null>(null);
  const [generating1, setGenerating1] = useState(false);
  const [generating2, setGenerating2] = useState(false);
  const [hydrating, setHydrating] = useState(false);

  const effectiveTeam1 = team1Id ? (teams.find(t => t.id === team1Id) ?? null) : randomTeam1;
  const effectiveTeam2 = team2Id ? (teams.find(t => t.id === team2Id) ?? null) : randomTeam2;

  const canStart = effectiveTeam1 && effectiveTeam2 &&
    effectiveTeam1.id !== effectiveTeam2.id &&
    effectiveTeam1.pokemon.length > 0 && effectiveTeam2.pokemon.length > 0;

  const handleGenerate = async (slot: 1 | 2) => {
    if (slot === 1) { setGenerating1(true); setTeam1Id(null); }
    else { setGenerating2(true); setTeam2Id(null); }
    try {
      const team = await generateRandomTeam();
      if (slot === 1) setRandomTeam1(team);
      else setRandomTeam2(team);
    } finally {
      if (slot === 1) setGenerating1(false);
      else setGenerating2(false);
    }
  };

  const quickRandomBattle = async () => {
    setGenerating1(true);
    setGenerating2(true);
    setTeam1Id(null);
    setTeam2Id(null);
    try {
      const [t1, t2] = await Promise.all([generateRandomTeam(), generateRandomTeam()]);
      setRandomTeam1(t1);
      setRandomTeam2(t2);
      setHydrating(true);
      const hydrateTeam = async (t: Team): Promise<Team> => ({
        ...t,
        pokemon: await Promise.all(t.pokemon.map(async p => ({
          ...p,
          selectedMoves: await Promise.all(p.selectedMoves.map(m => fetchMove(m.name).then(fresh => fresh ?? m))),
        }))),
      });
      const [h1, h2] = await Promise.all([hydrateTeam(t1), hydrateTeam(t2)]);
      startBattle(h1, h2);
      onBattleStart();
    } finally {
      setGenerating1(false);
      setGenerating2(false);
      setHydrating(false);
    }
  };

  const handleSave = (team: Team) => {
    const saved = createTeam(team.name);
    team.pokemon.forEach(p => addPokemonToTeam(saved.id, p));
  };

  const begin = async () => {
    if (!effectiveTeam1 || !effectiveTeam2) return;
    setHydrating(true);
    const hydrateTeam = async (t: Team): Promise<Team> => ({
      ...t,
      pokemon: await Promise.all(t.pokemon.map(async p => ({
        ...p,
        selectedMoves: await Promise.all(
          p.selectedMoves.map(m => fetchMove(m.name).then(fresh => fresh ?? m))
        ),
      }))),
    });
    const [h1, h2] = await Promise.all([hydrateTeam(effectiveTeam1), hydrateTeam(effectiveTeam2)]);
    startBattle(h1, h2);
    onBattleStart();
  };

  const renderSlot = (slot: 1 | 2) => {
    const selectedId = slot === 1 ? team1Id : team2Id;
    const randomTeam = slot === 1 ? randomTeam1 : randomTeam2;
    const generating = slot === 1 ? generating1 : generating2;
    const label = slot === 1 ? 'Team 1 (Player 1)' : 'Team 2 (Player 2)';

    return (
      <div className="mb-6">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">{label}</h3>

        {randomTeam && !selectedId ? (
          <RandomTeamCard
            team={randomTeam}
            onReroll={() => handleGenerate(slot)}
            onSave={() => handleSave(randomTeam)}
            rerolling={generating}
          />
        ) : (
          <div className="space-y-2">
            {teams.map(t => (
              <TeamCard
                key={t.id}
                team={t}
                selected={selectedId === t.id}
                onClick={() => {
                  if (slot === 1) { setTeam1Id(t.id === selectedId ? null : t.id); setRandomTeam1(null); }
                  else { setTeam2Id(t.id === selectedId ? null : t.id); setRandomTeam2(null); }
                }}
              />
            ))}
          </div>
        )}

        <button
          onClick={() => handleGenerate(slot)}
          disabled={generating}
          className="mt-3 w-full py-2.5 rounded-xl border border-dashed border-gray-600 hover:border-green-500 hover:bg-green-900/20 text-gray-400 hover:text-green-400 text-sm font-bold transition-all disabled:opacity-50"
        >
          {generating ? '⏳ Generating…' : '🎲 Random Team'}
        </button>

        {randomTeam && selectedId && (
          <button
            onClick={() => { if (slot === 1) setTeam1Id(null); else setTeam2Id(null); }}
            className="mt-1 w-full text-xs text-gray-600 hover:text-gray-400 py-1"
          >
            ← Use random team instead
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xl">←</button>
          <h2 className="text-2xl font-bold">Choose Teams</h2>
        </div>

        <button
          onClick={quickRandomBattle}
          disabled={hydrating || generating1 || generating2}
          className="w-full py-4 rounded-2xl bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg mb-6 transition-all hover:scale-105 active:scale-95"
        >
          {(hydrating || generating1 || generating2) ? '⏳ Generating…' : '⚡ Quick Random Battle'}
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="text-xs text-gray-500 uppercase tracking-wider">or pick teams</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>

        {renderSlot(1)}
        {renderSlot(2)}

        {effectiveTeam1 && effectiveTeam2 && effectiveTeam1.id === effectiveTeam2.id && (
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
