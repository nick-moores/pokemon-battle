import { useState } from 'react';
import { useTeamStore } from '../store/teamStore';
import { Team, TeamPokemon, Move, BasePokemon } from '../types';
import { fetchPokemon, fetchMove, usePokemonSearch } from '../hooks/usePokeAPI';
import { TypeBadge } from '../components/TypeBadge';

interface TeamBuilderScreenProps {
  onBack: () => void;
}

async function loadMovesInBatches(
  names: string[],
  onBatch: (moves: Move[]) => void,
  onDone: () => void,
) {
  const BATCH = 10;
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(n => fetchMove(n)));
    const valid = results.filter((m): m is Move => m !== null);
    if (valid.length > 0) onBatch(valid);
  }
  onDone();
}

function MoveSelector({ pokemon, teamId, onDone }: { pokemon: TeamPokemon; teamId: string; onDone: () => void }) {
  const { updatePokemonMoves } = useTeamStore();
  const [moveNames, setMoveNames] = useState<string[]>(pokemon.availableMoveNames);
  const [loadedMoves, setLoadedMoves] = useState<Move[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Move[]>(pokemon.selectedMoves ?? []);

  const startLoading = async () => {
    if (loading || loaded) return;
    setLoading(true);

    // Re-fetch if list looks truncated (saved before the 40-cap was removed)
    let names = moveNames;
    if (names.length <= 40) {
      const fresh = await fetchPokemon(pokemon.name);
      if (fresh && fresh.availableMoveNames.length > names.length) {
        names = fresh.availableMoveNames;
        setMoveNames(names);
      }
    }

    const total = names.length;
    let seen = 0;
    loadMovesInBatches(
      names,
      (batch) => {
        seen += 10;
        setProgress(Math.min(100, Math.round((seen / total) * 100)));
        setLoadedMoves(prev => [...prev, ...batch]);
      },
      () => { setLoading(false); setLoaded(true); setProgress(100); }
    );
  };

  const toggle = (move: Move) => {
    setSelected(prev => {
      if (prev.find(m => m.id === move.id)) return prev.filter(m => m.id !== move.id);
      if (prev.length >= 4) return prev;
      return [...prev, move];
    });
  };

  const save = () => {
    updatePokemonMoves(teamId, pokemon.id, selected);
    onDone();
  };

  const visible = filter.trim()
    ? loadedMoves.filter(m => m.displayName.toLowerCase().includes(filter.toLowerCase()))
    : loadedMoves;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-gray-700 flex items-center gap-3">
          <img src={pokemon.sprite} alt={pokemon.displayName} className="w-12 h-12 object-contain" />
          <div>
            <h3 className="font-bold text-white text-lg">{pokemon.displayName}</h3>
            <div className="flex gap-1">
              {pokemon.types.map(t => <TypeBadge key={t} type={t} small />)}
            </div>
          </div>
          <div className="ml-auto text-sm text-gray-400">{selected.length}/4 moves</div>
        </div>

        {!loaded && !loading && (
          <div className="p-6 text-center">
            <p className="text-gray-400 text-sm mb-3">{moveNames.length <= 40 ? '40+ moves' : moveNames.length + ' moves'} available</p>
            <button
              onClick={startLoading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white"
            >
              Load Moves
            </button>
          </div>
        )}

        {loading && (
          <div className="p-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Loading moves…</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            {loadedMoves.length > 0 && <p className="text-gray-500 text-xs mt-1">{loadedMoves.length} loaded so far — you can pick now</p>}
          </div>
        )}

        {(loaded || loading) && loadedMoves.length > 0 && (
          <div className="px-3 pt-2 pb-1">
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search moves (e.g. luster purge)…"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
            />
          </div>
        )}

        {(loaded || loading) && loadedMoves.length > 0 && (
          <div className="overflow-y-auto flex-1 p-3 space-y-1.5">
            {visible.map(move => {
              const isSelected = !!selected.find(m => m.id === move.id);
              return (
                <button
                  key={move.id}
                  onClick={() => toggle(move)}
                  disabled={!isSelected && selected.length >= 4}
                  className={`
                    w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-all
                    ${isSelected ? 'bg-blue-700 border-2 border-blue-400' : 'bg-gray-800 border-2 border-transparent hover:border-gray-600'}
                    disabled:opacity-40
                  `}
                >
                  <TypeBadge type={move.type} small />
                  <span className="flex-1 font-medium text-white text-sm">{move.displayName}</span>
                  <span className="text-xs text-gray-400">{move.power ? `${move.power} pw` : move.damageClass === 'status' ? 'status' : 'OHKO'}</span>
                  <span className="text-xs text-gray-500 capitalize">{move.damageClass}</span>
                  {isSelected && <span className="text-blue-300 text-xs font-bold">✓</span>}
                </button>
              );
            })}
            {visible.length === 0 && filter && (
              <p className="text-center text-gray-600 py-4">No moves matching "{filter}"</p>
            )}
          </div>
        )}

        <div className="p-4 border-t border-gray-700 flex gap-3">
          <button onClick={onDone} className="flex-1 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={selected.length === 0}
            className="flex-1 py-2 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-bold"
          >
            Save {selected.length} Moves
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamCard({ team, onEdit }: { team: Team; onEdit: () => void }) {
  const { deleteTeam } = useTeamStore();
  return (
    <div className="bg-gray-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-white text-lg">{team.name}</h3>
        <div className="flex gap-2">
          <button onClick={onEdit} className="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-bold text-white">Edit</button>
          <button onClick={() => deleteTeam(team.id)} className="px-3 py-1 bg-gray-700 hover:bg-red-700 rounded-lg text-sm font-bold text-white">✕</button>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {team.pokemon.map(p => (
          <div key={p.id} className="flex flex-col items-center">
            <img src={p.sprite} alt={p.displayName} className="w-12 h-12 object-contain" />
            <span className="text-xs text-gray-400 text-center leading-tight mt-0.5">{p.displayName}</span>
            <span className="text-[9px] text-gray-600">{p.selectedMoves.length} moves</span>
          </div>
        ))}
        {team.pokemon.length === 0 && (
          <span className="text-gray-500 text-sm">No Pokemon yet — click Edit</span>
        )}
      </div>
    </div>
  );
}

function EditTeam({ team, onBack }: { team: Team; onBack: () => void }) {
  const { addPokemonToTeam, removePokemonFromTeam, updateTeam } = useTeamStore();
  const [query, setQuery] = useState('');
  const [editingMoves, setEditingMoves] = useState<TeamPokemon | null>(null);
  const [teamName, setTeamName] = useState(team.name);
  const { suggestions, selected: found, loading, error, onQueryChange, selectSuggestion, clear } = usePokemonSearch();

  const currentTeam = useTeamStore(s => s.teams.find(t => t.id === team.id))!;

  const handleQueryChange = (val: string) => {
    setQuery(val);
    onQueryChange(val);
  };

  const addToTeam = () => {
    if (!found || currentTeam.pokemon.length >= 6) return;
    if (currentTeam.pokemon.find(p => p.id === found.id)) return;
    addPokemonToTeam(team.id, { ...found, selectedMoves: [] });
    clear();
    setQuery('');
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      {editingMoves && (
        <MoveSelector
          pokemon={editingMoves}
          teamId={team.id}
          onDone={() => setEditingMoves(null)}
        />
      )}

      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xl">←</button>
          <input
            value={teamName}
            onChange={e => setTeamName(e.target.value)}
            onBlur={() => updateTeam(team.id, { name: teamName })}
            className="flex-1 bg-transparent text-2xl font-bold border-b-2 border-gray-700 focus:border-blue-500 outline-none"
          />
        </div>

        <div className="bg-gray-800 rounded-2xl p-4 mb-4">
          <h3 className="font-bold mb-3 text-gray-300">Add Pokemon ({currentTeam.pokemon.length}/6)</h3>
          <input
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="Type to search (e.g. skele, hisuian…)"
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-white placeholder-gray-500 outline-none focus:border-blue-500"
          />

          {/* Suggestions dropdown */}
          {suggestions.length > 0 && !found && (
            <div className="mt-2 bg-gray-700 rounded-xl overflow-hidden border border-gray-600">
              {suggestions.map(name => (
                <button
                  key={name}
                  onClick={() => { selectSuggestion(name); setQuery(name); }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-600 text-white text-sm capitalize transition-colors"
                >
                  {name.replace(/-/g, ' ')}
                </button>
              ))}
            </div>
          )}

          {loading && <p className="text-gray-400 text-sm mt-2">Loading…</p>}
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

          {found && (
            <div className="mt-3 flex items-center gap-3 bg-gray-700 rounded-xl p-3">
              <img src={found.sprite} alt={found.displayName} className="w-16 h-16 object-contain" />
              <div className="flex-1">
                <div className="font-bold text-white">{found.displayName}</div>
                <div className="flex gap-1 mt-1">
                  {found.types.map(t => <TypeBadge key={t} type={t} small />)}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  HP {found.stats.hp} | ATK {found.stats.attack} | SPD {found.stats.speed}
                </div>
              </div>
              <button
                onClick={addToTeam}
                disabled={currentTeam.pokemon.length >= 6 || !!currentTeam.pokemon.find(p => p.id === found.id)}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-xl font-bold text-sm"
              >
                Add
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {currentTeam.pokemon.map((p, i) => (
            <div key={p.id} className="bg-gray-800 rounded-2xl p-3 flex items-center gap-3">
              <span className="text-gray-600 font-bold w-4 text-center">{i + 1}</span>
              <img src={p.sprite} alt={p.displayName} className="w-12 h-12 object-contain" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white">{p.displayName}</div>
                <div className="flex gap-1 mt-0.5">
                  {p.types.map(t => <TypeBadge key={t} type={t} small />)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {p.selectedMoves.length > 0
                    ? p.selectedMoves.map(m => m.displayName).join(', ')
                    : 'No moves selected'}
                </div>
              </div>
              <button
                onClick={() => setEditingMoves(p)}
                className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded-lg text-xs font-bold shrink-0"
              >
                Moves
              </button>
              <button
                onClick={() => removePokemonFromTeam(team.id, p.id)}
                className="p-1.5 bg-gray-700 hover:bg-red-700 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>
          ))}
          {currentTeam.pokemon.length === 0 && (
            <div className="text-center py-8 text-gray-600">
              <div className="text-4xl mb-2">🔍</div>
              Search for a Pokemon above to add it
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function exportTeams(teams: Team[]) {
  const json = JSON.stringify({ version: 1, teams }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pokemon-teams-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TeamBuilderScreen({ onBack }: TeamBuilderScreenProps) {
  const { teams, createTeam, updateTeam, deleteTeam, addPokemonToTeam, updatePokemonMoves } = useTeamStore();
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [importError, setImportError] = useState('');

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const incoming: Team[] = parsed.teams ?? parsed; // support both formats
        if (!Array.isArray(incoming)) throw new Error('Invalid format');

        for (const team of incoming) {
          // Skip if a team with the same id already exists
          if (teams.find(t => t.id === team.id)) continue;
          const created = createTeam(team.name);
          updateTeam(created.id, { id: team.id, name: team.name });
          for (const p of team.pokemon) {
            addPokemonToTeam(team.id, { ...p, selectedMoves: [] });
            if (p.selectedMoves?.length) updatePokemonMoves(team.id, p.id, p.selectedMoves);
          }
        }
        setImportError('');
      } catch {
        setImportError('Could not read file — make sure it\'s a Pokemon Battle export.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (editingTeam) {
    return <EditTeam team={editingTeam} onBack={() => setEditingTeam(null)} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xl">←</button>
          <h2 className="text-2xl font-bold">Manage Teams</h2>
        </div>

        <button
          onClick={() => {
            const team = createTeam(`Team ${teams.length + 1}`);
            setEditingTeam(team);
          }}
          className="w-full py-4 mb-4 rounded-2xl border-2 border-dashed border-gray-700 hover:border-blue-500 text-gray-400 hover:text-blue-400 font-bold text-lg transition-all"
        >
          + New Team
        </button>

        <div className="space-y-4">
          {teams.map(team => (
            <TeamCard key={team.id} team={team} onEdit={() => setEditingTeam(team)} />
          ))}
          {teams.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <div className="text-5xl mb-3">🏟️</div>
              <div>No teams yet. Create your first team!</div>
            </div>
          )}
        </div>

        {teams.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-800 flex gap-3">
            <button
              onClick={() => exportTeams(teams)}
              className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm font-bold text-gray-300 hover:text-white transition-all"
            >
              💾 Export Teams
            </button>
            <label className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm font-bold text-gray-300 hover:text-white transition-all text-center cursor-pointer">
              📂 Import Teams
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          </div>
        )}
        {!teams.length && (
          <div className="mt-4 flex justify-center">
            <label className="py-3 px-6 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm font-bold text-gray-300 hover:text-white transition-all text-center cursor-pointer">
              📂 Import Teams from file
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          </div>
        )}
        {importError && <p className="text-red-400 text-sm mt-2 text-center">{importError}</p>}
      </div>
    </div>
  );
}
