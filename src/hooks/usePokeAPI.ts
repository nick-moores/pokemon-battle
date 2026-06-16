import { useState, useCallback, useEffect } from 'react';
import { BasePokemon, Move } from '../types';

const BASE_URL = 'https://pokeapi.co/api/v2';
const pokemonCache = new Map<string, BasePokemon>();
const moveCache = new Map<string, Move>();

const REGION_ADJECTIVES: Record<string, string> = {
  alola: 'Alolan',
  galar: 'Galarian',
  hisui: 'Hisuian',
  paldea: 'Paldean',
};

function formatName(name: string): string {
  const parts = name.split('-');
  // Check if the last part (or last two parts for paldea sub-forms) is a region
  const lastPart = parts[parts.length - 1];
  const adjective = REGION_ADJECTIVES[lastPart];
  if (adjective) {
    const baseName = parts.slice(0, -1).join(' ').replace(/\b\w/g, c => c.toUpperCase());
    return `${adjective} ${baseName}`;
  }
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const REGION_MAP: Record<string, string> = {
  alolan: 'alola', alola: 'alola',
  galarian: 'galar', galar: 'galar',
  hisuian: 'hisui', hisui: 'hisui',
  paldean: 'paldea', paldea: 'paldea',
};

function queryVariants(raw: string): string[] {
  const base = raw.toLowerCase().trim();
  const hyphenated = base.replace(/\s+/g, '-');
  const variants = [hyphenated];

  // "hisuian zoroark" → "zoroark-hisui"
  for (const [prefix, suffix] of Object.entries(REGION_MAP)) {
    if (base.startsWith(prefix + ' ')) {
      const pokemonPart = base.slice(prefix.length + 1).trim().replace(/\s+/g, '-');
      variants.unshift(`${pokemonPart}-${suffix}`);
    }
  }

  // "zoroark hisui" → "zoroark-hisui" (already covered by hyphenated, but also try reversed)
  const words = base.split(/\s+/);
  if (words.length === 2) {
    const [a, b] = words;
    if (REGION_MAP[b]) variants.push(`${a}-${REGION_MAP[b]}`);
    if (REGION_MAP[a]) variants.push(`${b}-${REGION_MAP[a]}`);
  }

  return [...new Set(variants)];
}

export async function fetchMove(name: string): Promise<Move | null> {
  if (moveCache.has(name)) return moveCache.get(name)!;
  try {
    const res = await fetch(`${BASE_URL}/move/${name}`);
    if (!res.ok) return null;
    const data = await res.json();
    const effect = data.effect_entries?.find((e: any) => e.language.name === 'en');
    const move: Move = {
      id: data.id,
      name: data.name,
      displayName: formatName(data.name),
      type: data.type.name,
      power: data.power,
      pp: data.pp,
      damageClass: data.damage_class.name,
      effectEntry: effect?.short_effect?.replace(/\$effect_chance/g, `${data.effect_chance ?? ''}`) ?? '',
      ailment: data.meta?.ailment?.name ?? 'none',
      ailmentChance: data.meta?.ailment_chance ?? 0,
      category: data.meta?.category?.name ?? '',
    };
    moveCache.set(name, move);
    return move;
  } catch {
    return null;
  }
}

export async function fetchPokemon(nameOrId: string | number): Promise<BasePokemon | null> {
  const key = String(nameOrId).toLowerCase();
  if (pokemonCache.has(key)) return pokemonCache.get(key)!;

  const variants = typeof nameOrId === 'string' ? queryVariants(nameOrId) : [key];
  let data: any = null;
  let resolvedKey = key;
  for (const variant of variants) {
    if (pokemonCache.has(variant)) return pokemonCache.get(variant)!;
    try {
      const res = await fetch(`${BASE_URL}/pokemon/${variant}`);
      if (res.ok) { data = await res.json(); resolvedKey = variant; break; }
    } catch { /* try next */ }
  }
  if (!data) return null;

  const statsMap: Record<string, keyof BasePokemon['stats']> = {
    hp: 'hp', attack: 'attack', defense: 'defense',
    'special-attack': 'specialAttack', 'special-defense': 'specialDefense', speed: 'speed',
  };
  const stats: BasePokemon['stats'] = { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 };
  for (const s of data.stats) {
    const statKey = statsMap[s.stat.name];
    if (statKey) stats[statKey] = s.base_stat;
  }

  const availableMoveNames: string[] = data.moves.map((m: any) => m.move.name as string);

  const pokemon: BasePokemon = {
    id: data.id,
    name: data.name,
    displayName: formatName(data.name),
    sprite: data.sprites.other?.['official-artwork']?.front_default ?? data.sprites.front_default ?? '',
    backSprite: data.sprites.back_default ?? data.sprites.front_default ?? '',
    types: data.types.map((t: any) => t.type.name as string),
    stats,
    availableMoveNames,
  };
  pokemonCache.set(resolvedKey, pokemon);
  pokemonCache.set(key, pokemon);
  pokemonCache.set(String(data.id), pokemon);
  return pokemon;
}

// --- Name list for autocomplete ---

let allNamesCache: string[] | null = null;
let allNamesPromise: Promise<string[]> | null = null;

export async function loadAllPokemonNames(): Promise<string[]> {
  if (allNamesCache) return allNamesCache;
  if (allNamesPromise) return allNamesPromise;
  allNamesPromise = fetch(`${BASE_URL}/pokemon?limit=10000`)
    .then(r => r.json())
    .then(d => { allNamesCache = d.results.map((p: any) => p.name as string); return allNamesCache!; })
    .catch(() => { allNamesPromise = null; return []; });
  return allNamesPromise;
}

export function matchNames(names: string[], query: string, limit = 10): string[] {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];

  // Build patterns to test each API name against
  const patterns: string[] = [q.replace(/\s+/g, '-')];

  // "hisuian" or "hisuian zoro" → also search the hisui suffix
  for (const [adj, suffix] of Object.entries(REGION_MAP)) {
    if (q === adj || q.startsWith(adj + ' ')) {
      const rest = q.slice(adj.length).trim().replace(/\s+/g, '-');
      patterns.push(rest ? `${rest}-${suffix}` : suffix);
    }
  }

  return names
    .filter(name => patterns.some(p => name.startsWith(p) || name.includes(p)))
    .sort((a, b) => {
      // prefer names that start with the first pattern
      const p = patterns[0];
      return (b.startsWith(p) ? 1 : 0) - (a.startsWith(p) ? 1 : 0);
    })
    .slice(0, limit);
}

export function usePokemonSearch() {
  const [allNames, setAllNames] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<BasePokemon | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAllPokemonNames().then(setAllNames);
  }, []);

  const onQueryChange = useCallback((query: string) => {
    setSelected(null);
    setError(null);
    if (!query.trim()) { setSuggestions([]); return; }
    setSuggestions(matchNames(allNames, query));
  }, [allNames]);

  const selectSuggestion = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    const pokemon = await fetchPokemon(name);
    if (pokemon) setSelected(pokemon);
    else setError('Failed to load Pokemon');
    setLoading(false);
  }, []);

  const clear = useCallback(() => {
    setSelected(null);
    setSuggestions([]);
    setError(null);
  }, []);

  return { allNames, suggestions, selected, loading, error, onQueryChange, selectSuggestion, clear };
}
