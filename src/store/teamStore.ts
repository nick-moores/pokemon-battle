import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Team, TeamPokemon } from '../types';

interface TeamStore {
  teams: Team[];
  createTeam: (name: string) => Team;
  updateTeam: (id: string, updates: Partial<Team>) => void;
  deleteTeam: (id: string) => void;
  addPokemonToTeam: (teamId: string, pokemon: TeamPokemon) => void;
  removePokemonFromTeam: (teamId: string, pokemonId: number) => void;
  updatePokemonMoves: (teamId: string, pokemonId: number, moves: TeamPokemon['selectedMoves']) => void;
}

export const useTeamStore = create<TeamStore>()(
  persist(
    (set) => ({
      teams: [],

      createTeam: (name) => {
        const team: Team = { id: crypto.randomUUID(), name, pokemon: [] };
        set((s) => ({ teams: [...s.teams, team] }));
        return team;
      },

      updateTeam: (id, updates) =>
        set((s) => ({ teams: s.teams.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),

      deleteTeam: (id) =>
        set((s) => ({ teams: s.teams.filter((t) => t.id !== id) })),

      addPokemonToTeam: (teamId, pokemon) =>
        set((s) => ({
          teams: s.teams.map((t) =>
            t.id === teamId && t.pokemon.length < 6
              ? { ...t, pokemon: [...t.pokemon, pokemon] }
              : t
          ),
        })),

      removePokemonFromTeam: (teamId, pokemonId) =>
        set((s) => ({
          teams: s.teams.map((t) =>
            t.id === teamId
              ? { ...t, pokemon: t.pokemon.filter((p) => p.id !== pokemonId) }
              : t
          ),
        })),

      updatePokemonMoves: (teamId, pokemonId, moves) =>
        set((s) => ({
          teams: s.teams.map((t) =>
            t.id === teamId
              ? {
                  ...t,
                  pokemon: t.pokemon.map((p) =>
                    p.id === pokemonId ? { ...p, selectedMoves: moves } : p
                  ),
                }
              : t
          ),
        })),
    }),
    { name: 'pokemon-teams' }
  )
);
