import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  BattleState, BattleTeam, BattlePokemon, Move, Team,
  StatusCondition, BattleRecord, BattleLogEntry, WeatherType, PokemonStats, FutureSightState
} from '../types';
import { calculateDamage, getStatusTickDamage, getStagedSpeed, ZERO_STAGES } from '../utils/damage';
import { Stages } from '../types';
import { getEffectivenessText } from '../data/typeChart';

const WEATHER_MOVES: Record<string, WeatherType> = {
  'sunny-day': 'sunny',
  'rain-dance': 'rain',
  'sandstorm': 'sandstorm',
  'hail': 'hail',
  'snow': 'hail',
};

const WEATHER_START: Record<WeatherType, string> = {
  sunny: 'The sunlight turned harsh!',
  rain: 'It started to rain!',
  sandstorm: 'A sandstorm kicked up!',
  hail: 'It started to hail!',
};

const WEATHER_END: Record<WeatherType, string> = {
  sunny: 'The sunlight faded.',
  rain: 'The rain stopped.',
  sandstorm: 'The sandstorm subsided.',
  hail: 'The hail stopped.',
};

// Types immune to sandstorm/hail chip damage
const WEATHER_IMMUNE: Record<WeatherType, string[]> = {
  sunny: [],
  rain: [],
  sandstorm: ['rock', 'ground', 'steel'],
  hail: ['ice'],
};

// Two-turn moves: charge turn + release turn. invulnerable = can't be hit on charge turn.
// Moves that lock the user in for 2-3 turns then confuse them
const LOCK_IN_MOVES = new Set(['outrage', 'thrash', 'petal-dance', 'raging-fury']);
const PIVOT_MOVES = new Set(['u-turn', 'volt-switch', 'flip-turn']);

const TWO_TURN_MOVES: Record<string, { chargeMsg: string; invulnerable: boolean }> = {
  'dig':           { chargeMsg: 'burrowed underground!', invulnerable: true },
  'fly':           { chargeMsg: 'flew up high!',         invulnerable: true },
  'bounce':        { chargeMsg: 'sprang up high!',       invulnerable: true },
  'dive':          { chargeMsg: 'dove underwater!',      invulnerable: true },
  'phantom-force': { chargeMsg: 'vanished!',             invulnerable: true },
  'shadow-force':  { chargeMsg: 'vanished!',             invulnerable: true },
  'skull-bash':    { chargeMsg: 'tucked in its head!',   invulnerable: false },
  'solar-beam':    { chargeMsg: 'absorbed light!',       invulnerable: false },
  'meteor-beam':   { chargeMsg: 'is aiming at the sky!', invulnerable: false },
};

let logId = 0;
function log(text: string, type: BattleLogEntry['type'] = 'info', damageCalc?: BattleLogEntry['damageCalc']): BattleLogEntry {
  return { id: logId++, text, type, damageCalc };
}

// Convert base stats (Pokedex values) to actual level-50 stats
// Formula: floor((2*base + 31) * 50/100) + offset  (31 IVs, 0 EVs, neutral nature)
function toLevel50Stats(base: PokemonStats): PokemonStats {
  const s = (b: number) => Math.floor((2 * b + 31) * 50 / 100) + 5;
  return {
    hp: Math.floor((2 * base.hp + 31) * 50 / 100) + 60,
    attack: s(base.attack),
    defense: s(base.defense),
    specialAttack: s(base.specialAttack),
    specialDefense: s(base.specialDefense),
    speed: s(base.speed),
  };
}

function initBattlePokemon(p: Team['pokemon'][0]): BattlePokemon {
  const battleStats = toLevel50Stats(p.stats);
  return {
    ...p,
    stats: battleStats,
    ability: p.ability || (p.availableAbilities?.[0] ?? ''),
    currentHp: battleStats.hp,
    status: 'none',
    confusionTurns: 0,
    sleepTurns: 0,
    poisonCount: 1,
    isFainted: false,
    stages: { ...ZERO_STAGES },
    flashFireActive: false,
    chargingMove: null,
    isInvulnerable: false,
    currentPP: p.selectedMoves.map(m => m.pp),
    substituteHp: null,
    lockedMove: null,
    lockedTurns: 0,
  };
}

function clampStage(stage: number, delta: number): number {
  return Math.max(-6, Math.min(6, stage + delta));
}

function applyStatChanges(pokemon: BattlePokemon, changes: { stat: string; change: number }[], logs: BattleLogEntry[]): BattlePokemon {
  if (!changes.length) return pokemon;
  let stages = { ...pokemon.stages };
  for (const { stat, change } of changes) {
    const key = stat as keyof Stages;
    if (!(key in stages)) continue;
    const before = stages[key];
    const after = clampStage(before, change);
    stages = { ...stages, [key]: after };
    const statLabel: Record<string, string> = {
      attack: 'Attack', defense: 'Defense', specialAttack: 'Sp. Atk',
      specialDefense: 'Sp. Def', speed: 'Speed', accuracy: 'Accuracy', evasion: 'Evasion',
    };
    if (after === before) {
      logs.push(log(`${pokemon.displayName}'s ${statLabel[stat]} won't go any ${change > 0 ? 'higher' : 'lower'}!`, 'status'));
    } else {
      const delta = after - before;
      const magnitude = Math.abs(delta) >= 3 ? 'drastically' : Math.abs(delta) === 2 ? 'sharply' : '';
      const direction = delta > 0 ? 'rose' : 'fell';
      logs.push(log(`${pokemon.displayName}'s ${statLabel[stat]} ${magnitude ? magnitude + ' ' : ''}${direction}!`, 'status'));
    }
  }
  return { ...pokemon, stages };
}

function initBattleTeam(team: Team): BattleTeam {
  return {
    teamId: team.id,
    name: team.name,
    pokemon: team.pokemon.map(initBattlePokemon),
    activeIndex: 0,
    tailwindTurns: 0,
    futureSight: null,
  };
}

function applyDamage(p: BattlePokemon, dmg: number): BattlePokemon {
  const currentHp = Math.max(0, p.currentHp - dmg);
  return { ...p, currentHp, isFainted: currentHp === 0 };
}

function applyStatus(p: BattlePokemon, status: StatusCondition): BattlePokemon {
  if (p.status !== 'none' || status === 'none') return p;
  return { ...p, status };
}

function resolveStatusEffect(
  p: BattlePokemon,
  logs: BattleLogEntry[]
): { pokemon: BattlePokemon; canMove: boolean } {
  // Non-volatile status: sleep and freeze fully block the turn (confusion doesn't tick)
  if (p.status === 'sleep') {
    if (p.sleepTurns <= 0) {
      logs.push(log(`${p.displayName} woke up!`, 'status'));
      p = { ...p, status: 'none', sleepTurns: 0 };
      // fall through to confusion check
    } else {
      logs.push(log(`${p.displayName} is fast asleep...`, 'status'));
      return { pokemon: { ...p, sleepTurns: p.sleepTurns - 1 }, canMove: false };
    }
  } else if (p.status === 'freeze') {
    if (Math.random() < 0.2) {
      logs.push(log(`${p.displayName} thawed out!`, 'status'));
      p = { ...p, status: 'none' };
      // fall through to confusion check
    } else {
      logs.push(log(`${p.displayName} is frozen solid!`, 'status'));
      return { pokemon: p, canMove: false };
    }
  } else if (p.status === 'paralysis' && Math.random() < 0.25) {
    logs.push(log(`${p.displayName} is paralyzed and can't move!`, 'status'));
    return { pokemon: p, canMove: false };
    // paralysis that blocks also skips confusion
  }

  // Volatile: confusion stacks with any non-volatile status
  if (p.confusionTurns > 0) {
    p = { ...p, confusionTurns: p.confusionTurns - 1 };
    if (p.confusionTurns === 0) {
      logs.push(log(`${p.displayName} snapped out of confusion!`, 'status'));
      // can still act this turn
    } else if (Math.random() < 0.33) {
      const selfDmg = Math.max(1, Math.floor(p.stats.hp / 8));
      logs.push(log(`${p.displayName} hurt itself in confusion!`, 'damage'));
      return { pokemon: applyDamage(p, selfDmg), canMove: false };
    }
  }

  return { pokemon: p, canMove: true };
}

function applyEndOfTurnStatus(p: BattlePokemon, logs: BattleLogEntry[]): BattlePokemon {
  if (p.isFainted) return p;
  const dmg = getStatusTickDamage(p);
  if (dmg > 0) {
    const label = p.status === 'burn' ? 'burn' : 'poison';
    logs.push(log(`${p.displayName} is hurt by its ${label}!`, 'damage'));
    const updated = applyDamage(p, dmg);
    if (updated.isFainted) logs.push(log(`${p.displayName} fainted!`, 'faint'));
    if (p.status === 'badly-poisoned') return { ...updated, poisonCount: updated.poisonCount + 1 };
    return updated;
  }
  return p;
}

function applyWeatherTick(
  t1: BattleTeam, t2: BattleTeam,
  weather: WeatherType | null,
  logs: BattleLogEntry[]
): { t1: BattleTeam; t2: BattleTeam } {
  if (!weather || weather === 'sunny' || weather === 'rain') return { t1, t2 };
  const immune = WEATHER_IMMUNE[weather];
  const label = weather === 'sandstorm' ? 'sandstorm' : 'hail';
  const tickTeam = (team: BattleTeam): BattleTeam => ({
    ...team,
    pokemon: team.pokemon.map(p => {
      if (p.isFainted || p.types.some(t => immune.includes(t.toLowerCase())) ||
          (weather === 'sandstorm' && p.ability === 'sand-rush')) return p;
      const dmg = Math.max(1, Math.floor(p.stats.hp / 16));
      logs.push(log(`${p.displayName} is buffeted by the ${label}!`, 'damage'));
      const updated = applyDamage(p, dmg);
      if (updated.isFainted) logs.push(log(`${p.displayName} fainted!`, 'faint'));
      return updated;
    }),
  });
  return { t1: tickTeam(t1), t2: tickTeam(t2) };
}

const ENTRY_WEATHER: Record<string, WeatherType> = {
  'drought': 'sunny', 'drizzle': 'rain', 'sand-stream': 'sandstorm', 'snow-warning': 'hail',
};

function applyEntryAbility(
  incoming: BattlePokemon,
  opponent: BattlePokemon,
  weather: WeatherType | null,
  weatherTurnsLeft: number,
  logs: BattleLogEntry[]
): { incoming: BattlePokemon; opponent: BattlePokemon; weather: WeatherType | null; weatherTurnsLeft: number } {
  const ability = incoming.ability ?? '';

  // Weather-setting abilities
  const newWeather = ENTRY_WEATHER[ability];
  if (newWeather) {
    logs.push(log(`${incoming.displayName}'s ${ability === 'drought' ? 'Drought' : ability === 'drizzle' ? 'Drizzle' : ability === 'sand-stream' ? 'Sand Stream' : 'Snow Warning'}!`, 'status'));
    logs.push(log(WEATHER_START[newWeather], 'status'));
    weather = newWeather;
    weatherTurnsLeft = 5;
  }

  // Intimidate
  if (ability === 'intimidate' && !opponent.isFainted) {
    logs.push(log(`${incoming.displayName}'s Intimidate!`, 'status'));
    opponent = applyStatChanges(opponent, [{ stat: 'attack', change: -1 }], logs);
  }

  return { incoming, opponent, weather, weatherTurnsLeft };
}

function executeMove(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  attackerName: string,
  logs: BattleLogEntry[],
  weather: WeatherType | null,
): { atk: BattlePokemon; def: BattlePokemon; newWeather?: WeatherType; setTailwind?: boolean; futureSight?: FutureSightState } {
  logs.push(log(`${attackerName} used ${move.displayName}!`, 'move'));

  let atk = attacker;
  let def = defender;

  // Accuracy check — move.accuracy is null for always-hit moves (Swift, Aerial Ace, etc.)
  // Old saved moves without the field also always hit (backward compatible)
  const moveAcc: number | null = (move as any).accuracy ?? null;
  if (moveAcc != null) {
    const accStage = attacker.stages?.accuracy ?? 0;
    const evaStage = defender.stages?.evasion ?? 0;
    // Accuracy/evasion stage multiplier: max(3, 3+stage) / max(3, 3-stage)
    const accMult = Math.max(3, 3 + accStage) / Math.max(3, 3 - accStage);
    const evaMult = Math.max(3, 3 + evaStage) / Math.max(3, 3 - evaStage);
    const hitChance = (moveAcc / 100) * accMult / evaMult;
    if (Math.random() > hitChance) {
      logs.push(log('But it missed!', 'info'));
      return { atk, def };
    }
  }

  if (move.damageClass === 'status') {
    // Substitute
    if (move.name === 'substitute') {
      if (atk.substituteHp !== null) {
        logs.push(log(`${atk.displayName} already has a substitute!`, 'info'));
        return { atk, def };
      }
      const subCost = Math.floor(atk.stats.hp / 4);
      if (atk.currentHp <= subCost) {
        logs.push(log(`${atk.displayName} doesn't have enough HP to make a substitute!`, 'info'));
        return { atk, def };
      }
      atk = { ...atk, currentHp: atk.currentHp - subCost, substituteHp: subCost };
      logs.push(log(`${atk.displayName} put in a substitute!`, 'status'));
      return { atk, def };
    }

    // Tailwind: doubles Speed for attacker's team for 3 turns
    if (move.name === 'tailwind') {
      logs.push(log(`${atk.displayName} whipped up a Tailwind!`, 'status'));
      return { atk, def, setTailwind: true };
    }

    // Future Sight / Doom Desire: delayed attack that fires after 2 turns
    if (move.name === 'future-sight' || move.name === 'doom-desire') {
      logs.push(log(`${atk.displayName} foresaw an attack!`, 'status'));
      return { atk, def, futureSight: { turnsLeft: 3, attackerDisplayName: atk.displayName, move } };
    }

    // Weather-setting moves
    const newWeather = WEATHER_MOVES[move.name];
    if (newWeather !== undefined) {
      logs.push(log(WEATHER_START[newWeather], 'status'));
      return { atk, def, newWeather };
    }

    // Healing moves (Recover, Roost, Soft-Boiled, Slack Off, Moonlight, etc.)
    if (move.category === 'heal') {
      if (move.name === 'rest') {
        // Rest: heal to full + self-inflict sleep
        if (atk.status === 'sleep') {
          logs.push(log('But it failed!', 'info'));
        } else {
          atk = { ...atk, currentHp: atk.stats.hp, status: 'sleep', sleepTurns: 2 };
          logs.push(log(`${atk.displayName} restored its HP and fell into a deep slumber!`, 'status'));
        }
      } else {
        const restored = Math.max(1, Math.floor(atk.stats.hp / 2));
        if (atk.currentHp === atk.stats.hp) {
          logs.push(log(`But ${atk.displayName}'s HP is full!`, 'info'));
        } else {
          atk = { ...atk, currentHp: Math.min(atk.stats.hp, atk.currentHp + restored) };
          logs.push(log(`${atk.displayName} restored HP!`, 'status'));
        }
      }
      return { atk, def };
    }

    const statChanges = move.statChanges ?? [];
    const selfChanges = statChanges.filter(sc => sc.target === 'user');
    const oppChanges = statChanges.filter(sc => sc.target === 'opponent');

    const ailment = move.ailment;
    if (ailment === 'burn' || ailment === 'poison' || ailment === 'paralysis' || ailment === 'sleep' || ailment === 'freeze' || ailment === 'badly-poisoned') {
      if (def.substituteHp !== null) {
        logs.push(log(`${def.displayName}'s substitute blocked the move!`, 'info'));
      } else {
        const withStatus = applyStatus(def, ailment as StatusCondition);
        if (withStatus.status !== def.status) {
          let msg = '';
          if (ailment === 'burn') msg = `${def.displayName} was burned!`;
          else if (ailment === 'poison' || ailment === 'badly-poisoned') msg = `${def.displayName} was poisoned!`;
          else if (ailment === 'paralysis') msg = `${def.displayName} was paralyzed!`;
          else if (ailment === 'sleep') msg = `${def.displayName} fell asleep!`;
          else if (ailment === 'freeze') msg = `${def.displayName} was frozen!`;
          logs.push(log(msg, 'status'));
          def = ailment === 'sleep' ? { ...withStatus, sleepTurns: Math.floor(Math.random() * 3) + 1 } : withStatus;
        } else {
          logs.push(log(`But it failed!`, 'info'));
        }
      }
    } else if (ailment === 'confusion') {
      if (def.substituteHp !== null) {
        logs.push(log(`${def.displayName}'s substitute blocked the move!`, 'info'));
      } else if (def.confusionTurns === 0) {
        logs.push(log(`${def.displayName} became confused!`, 'status'));
        def = { ...def, confusionTurns: Math.floor(Math.random() * 3) + 2 };
      } else {
        logs.push(log(`But ${def.displayName} is already confused!`, 'info'));
      }
    }

    if (selfChanges.length) atk = applyStatChanges(atk, selfChanges, logs);
    if (oppChanges.length) {
      if (def.substituteHp !== null) {
        logs.push(log(`${def.displayName}'s substitute blocked the stat change!`, 'info'));
      } else {
        def = applyStatChanges(def, oppChanges, logs);
      }
    }
    return { atk, def };
  }

  // Ability-based type immunities (only for damage moves)
  const mtype = move.type.toLowerCase();
  if (def.ability === 'levitate' && mtype === 'ground') {
    logs.push(log(`${def.displayName} is unaffected thanks to Levitate!`, 'effectiveness'));
    return { atk, def };
  }
  if (def.ability === 'flash-fire' && mtype === 'fire') {
    if (!def.flashFireActive) logs.push(log(`${def.displayName}'s Flash Fire was activated!`, 'status'));
    def = { ...def, flashFireActive: true };
    return { atk, def };
  }
  if (def.ability === 'water-absorb' && mtype === 'water') {
    const heal = Math.max(1, Math.floor(def.stats.hp / 4));
    def = { ...def, currentHp: Math.min(def.stats.hp, def.currentHp + heal) };
    logs.push(log(`${def.displayName} absorbed the Water move and restored HP!`, 'status'));
    return { atk, def };
  }
  if (def.ability === 'volt-absorb' && mtype === 'electric') {
    const heal = Math.max(1, Math.floor(def.stats.hp / 4));
    def = { ...def, currentHp: Math.min(def.stats.hp, def.currentHp + heal) };
    logs.push(log(`${def.displayName} absorbed the Electric move and restored HP!`, 'status'));
    return { atk, def };
  }
  if (def.ability === 'storm-drain' && mtype === 'water') {
    logs.push(log(`${def.displayName}'s Storm Drain absorbed the Water move!`, 'status'));
    def = applyStatChanges(def, [{ stat: 'specialAttack', change: 1 }], logs);
    return { atk, def };
  }

  const calcResult = calculateDamage(atk, def, move, weather);
  const { damage, effectiveness, isCrit } = calcResult;

  if (effectiveness === 0) {
    logs.push(log(`It doesn't affect ${def.displayName}...`, 'effectiveness'));
    return { atk, def };
  }

  const effectText = getEffectivenessText(effectiveness);
  if (effectText) logs.push(log(effectText, 'effectiveness'));
  if (isCrit) logs.push(log('A critical hit!', 'info'));

  const calcRecord: BattleLogEntry['damageCalc'] = {
    moveName: move.displayName,
    attackerName: atk.displayName,
    power: move.power ?? 0,
    category: move.damageClass,
    atkStat: calcResult.atkStatEffective,
    defStat: calcResult.defStatEffective,
    atkStage: calcResult.atkStage,
    defStage: calcResult.defStage,
    stabMult: calcResult.stabMult,
    effectiveness,
    weatherMult: calcResult.weatherMult,
    abilityMult: calcResult.abilityMult,
    abilityNote: calcResult.abilityNote,
    isCrit,
    randomFactor: calcResult.randomFactor,
    finalDamage: damage,
    defenderMaxHp: def.stats.hp,
  };

  // Substitute: damage hits the sub instead of the Pokemon
  if (def.substituteHp !== null) {
    const subBefore = def.substituteHp;
    if (damage >= subBefore) {
      def = { ...def, substituteHp: null };
      logs.push(log(`The substitute took ${damage} damage!`, 'damage', calcRecord));
      logs.push(log(`${def.displayName}'s substitute broke!`, 'status'));
    } else {
      def = { ...def, substituteHp: subBefore - damage };
      logs.push(log(`The substitute took ${damage} damage! (${def.substituteHp} HP left)`, 'damage', calcRecord));
    }
    // Sub absorbs secondary effects — no ailment chance, no contact triggers
    const selfStatChanges = (move.statChanges ?? []).filter(sc => sc.target === 'user');
    if (selfStatChanges.length) atk = applyStatChanges(atk, selfStatChanges, logs);
    return { atk, def };
  }

  def = applyDamage(def, damage);
  logs.push(log(`${def.displayName} took ${damage} damage!`, 'damage', calcRecord));
  if (def.isFainted) logs.push(log(`${def.displayName} fainted!`, 'faint'));

  if (!def.isFainted && move.ailmentChance > 0 && Math.random() * 100 < move.ailmentChance) {
    if (move.ailment === 'confusion') {
      if (def.confusionTurns === 0) {
        logs.push(log(`${def.displayName} became confused!`, 'status'));
        def = { ...def, confusionTurns: Math.floor(Math.random() * 3) + 2 };
      }
    } else {
      const ailment = move.ailment as StatusCondition;
      const withStatus = applyStatus(def, ailment);
      if (withStatus.status !== def.status) {
        logs.push(log(`${def.displayName} was afflicted with ${ailment}!`, 'status'));
        def = ailment === 'sleep' ? { ...withStatus, sleepTurns: Math.floor(Math.random() * 3) + 1 } : withStatus;
      }
    }
  }

  // On-contact ability triggers (Flame Body, Poison Point) — defender hits back
  if (!atk.isFainted && !def.isFainted && move.damageClass === 'physical' && damage > 0) {
    if (def.ability === 'flame-body' && atk.status === 'none' && Math.random() < 0.3) {
      atk = applyStatus(atk, 'burn');
      logs.push(log(`${def.displayName}'s Flame Body burned ${atk.displayName}!`, 'status'));
    } else if (def.ability === 'poison-point' && atk.status === 'none' && Math.random() < 0.3) {
      atk = applyStatus(atk, 'poison');
      logs.push(log(`${def.displayName}'s Poison Point poisoned ${atk.displayName}!`, 'status'));
    }
  }

  // Self stat changes from damage moves (Close Combat, Draco Meteor, etc.) always apply
  const selfStatChanges = (move.statChanges ?? []).filter(sc => sc.target === 'user');
  if (selfStatChanges.length) atk = applyStatChanges(atk, selfStatChanges, logs);

  return { atk, def };
}

// Apply a voluntary mid-turn switch (costs the switching team's action for the turn).
// Switches happen before moves, in speed order when both teams switch simultaneously.
function applyVoluntarySwitch(
  switchingTeam: BattleTeam,
  opponentTeam: BattleTeam,
  pokemonIndex: number,
  weather: WeatherType | null,
  weatherTurnsLeft: number,
  logs: BattleLogEntry[],
): { team: BattleTeam; opponent: BattleTeam; weather: WeatherType | null; weatherTurnsLeft: number } {
  const outIdx = switchingTeam.activeIndex;
  const incoming = switchingTeam.pokemon[pokemonIndex];
  logs.push(log(`${switchingTeam.name} withdrew ${switchingTeam.pokemon[outIdx].displayName}!`, 'switch'));
  logs.push(log(`${switchingTeam.name} sent out ${incoming.displayName}!`, 'switch'));
  const resetArr = switchingTeam.pokemon.map((p, i) => {
    if (i === pokemonIndex) return { ...p, stages: { ...ZERO_STAGES } };
    if (i === outIdx) return { ...p, chargingMove: null, isInvulnerable: false, substituteHp: null, lockedMove: null, lockedTurns: 0 };
    return p;
  });
  let team = { ...switchingTeam, activeIndex: pokemonIndex, pokemon: resetArr };
  const entry = applyEntryAbility(team.pokemon[pokemonIndex], opponentTeam.pokemon[opponentTeam.activeIndex], weather, weatherTurnsLeft, logs);
  const teamP = [...team.pokemon]; teamP[pokemonIndex] = entry.incoming;
  const oppP = [...opponentTeam.pokemon]; oppP[opponentTeam.activeIndex] = entry.opponent;
  return {
    team: { ...team, pokemon: teamP },
    opponent: { ...opponentTeam, pokemon: oppP },
    weather: entry.weather,
    weatherTurnsLeft: entry.weatherTurnsLeft,
  };
}

// Execute one team's move for this turn. Returns updated teams and weather.
function runOneTurn(
  atk: BattleTeam,
  def: BattleTeam,
  atkMove: Move,
  atkTeamName: string,
  logs: BattleLogEntry[],
  weather: WeatherType | null,
  weatherTurnsLeft: number,
): { atk: BattleTeam; def: BattleTeam; weather: WeatherType | null; weatherTurnsLeft: number } {
  const atkIdx = atk.activeIndex;
  const defIdx = def.activeIndex;

  let atkPokemon = atk.pokemon[atkIdx];
  if (atkPokemon.isFainted) return { atk, def, weather, weatherTurnsLeft };

  const isLockedIn = !!atkPokemon.lockedMove;
  const moveToUse = atkPokemon.lockedMove ?? atkPokemon.chargingMove ?? atkMove;
  const wasCharging = !!atkPokemon.chargingMove;

  const { pokemon: resolved, canMove } = resolveStatusEffect(atkPokemon, logs);
  atkPokemon = resolved;
  const updatedAtkPokemon = [...atk.pokemon];
  updatedAtkPokemon[atkIdx] = atkPokemon;
  atk = { ...atk, pokemon: updatedAtkPokemon };

  if (!canMove || atkPokemon.isFainted) return { atk, def, weather, weatherTurnsLeft };

  if (!wasCharging && !isLockedIn) {
    const ppIdx = atkPokemon.selectedMoves.findIndex(m => m.id === moveToUse.id);
    if (ppIdx >= 0) {
      const newPP = [...(atkPokemon.currentPP ?? atkPokemon.selectedMoves.map(m => m.pp))];
      newPP[ppIdx] = Math.max(0, newPP[ppIdx] - 1);
      atkPokemon = { ...atkPokemon, currentPP: newPP };
      const ppArr = [...atk.pokemon]; ppArr[atkIdx] = atkPokemon;
      atk = { ...atk, pokemon: ppArr };
    }
  }

  const defPokemon = def.pokemon[defIdx];
  const teamLabel = `${atkTeamName}'s ${atkPokemon.displayName}`;

  const twoTurnInfo = TWO_TURN_MOVES[moveToUse.name];
  const isSolarInstant = moveToUse.name === 'solar-beam' && weather === 'sunny';
  if (twoTurnInfo && !wasCharging && !isSolarInstant) {
    logs.push(log(`${teamLabel} ${twoTurnInfo.chargeMsg}`, 'move'));
    let charged: BattlePokemon = { ...atkPokemon, chargingMove: moveToUse, isInvulnerable: twoTurnInfo.invulnerable };
    if (moveToUse.name === 'skull-bash') charged = applyStatChanges(charged, [{ stat: 'defense', change: 1 }], logs);
    if (moveToUse.name === 'meteor-beam') charged = applyStatChanges(charged, [{ stat: 'specialAttack', change: 1 }], logs);
    const arr = [...atk.pokemon]; arr[atkIdx] = charged;
    return { atk: { ...atk, pokemon: arr }, def, weather, weatherTurnsLeft };
  }

  if (defPokemon.isInvulnerable) {
    const chargeName = defPokemon.chargingMove?.name ?? '';
    const loc = (chargeName === 'dig' || chargeName === 'dive') ? 'underground' : 'in the air';
    logs.push(log(`The attack missed! ${defPokemon.displayName} is ${loc}!`, 'info'));
    return { atk, def, weather, weatherTurnsLeft };
  }

  if (wasCharging) {
    atkPokemon = { ...atkPokemon, chargingMove: null, isInvulnerable: false };
    const arr = [...atk.pokemon]; arr[atkIdx] = atkPokemon;
    atk = { ...atk, pokemon: arr };
  }

  const result = executeMove(atkPokemon, defPokemon, moveToUse, teamLabel, logs, weather);
  if (result.newWeather !== undefined) { weather = result.newWeather; weatherTurnsLeft = 5; }
  if (result.setTailwind) atk = { ...atk, tailwindTurns: 3 };
  if (result.futureSight) atk = { ...atk, futureSight: result.futureSight };

  const updatedAtkArr = [...atk.pokemon];
  let atkAfter = result.atk;

  if (LOCK_IN_MOVES.has(moveToUse.name) && !atkAfter.isFainted) {
    if (!isLockedIn) {
      atkAfter = { ...atkAfter, lockedMove: moveToUse, lockedTurns: Math.floor(Math.random() * 2) + 1 };
    } else {
      const remaining = atkAfter.lockedTurns - 1;
      if (remaining <= 0) {
        logs.push(log(`${atkAfter.displayName} became confused due to fatigue!`, 'status'));
        atkAfter = { ...atkAfter, lockedMove: null, lockedTurns: 0, confusionTurns: Math.floor(Math.random() * 3) + 2 };
      } else {
        atkAfter = { ...atkAfter, lockedTurns: remaining };
      }
    }
  }

  updatedAtkArr[atkIdx] = atkAfter;
  atk = { ...atk, pokemon: updatedAtkArr };
  const updatedDefArr = [...def.pokemon];
  updatedDefArr[defIdx] = result.def;
  def = { ...def, pokemon: updatedDefArr };

  return { atk, def, weather, weatherTurnsLeft };
}

function applyEndOfTurnAbilities(team: BattleTeam, weather: WeatherType | null, logs: BattleLogEntry[]): BattleTeam {
  const idx = team.activeIndex;
  let p = team.pokemon[idx];
  if (p.isFainted) return team;
  if (p.ability === 'speed-boost') p = applyStatChanges(p, [{ stat: 'speed', change: 1 }], logs);
  if (p.ability === 'rain-dish' && weather === 'rain') {
    const heal = Math.max(1, Math.floor(p.stats.hp / 16));
    if (p.currentHp < p.stats.hp) {
      p = { ...p, currentHp: Math.min(p.stats.hp, p.currentHp + heal) };
      logs.push(log(`${p.displayName} restored a little HP using Rain Dish!`, 'status'));
    }
  }
  const newPokemon = [...team.pokemon];
  newPokemon[idx] = p;
  return { ...team, pokemon: newPokemon };
}

function applyFutureSightForTeam(
  attackingTeam: BattleTeam,
  defendingTeam: BattleTeam,
  weather: WeatherType | null,
  logs: BattleLogEntry[],
): { atk: BattleTeam; def: BattleTeam } {
  if (!attackingTeam.futureSight) return { atk: attackingTeam, def: defendingTeam };
  const fs = attackingTeam.futureSight;
  const newTurns = fs.turnsLeft - 1;
  if (newTurns > 0) return { atk: { ...attackingTeam, futureSight: { ...fs, turnsLeft: newTurns } }, def: defendingTeam };
  const attacker = attackingTeam.pokemon[attackingTeam.activeIndex];
  const defIdx2 = defendingTeam.activeIndex;
  const defender2 = defendingTeam.pokemon[defIdx2];
  attackingTeam = { ...attackingTeam, futureSight: null };
  if (defender2.isFainted) return { atk: attackingTeam, def: defendingTeam };
  logs.push(log(`${fs.attackerDisplayName}'s ${fs.move.displayName} attack fell!`, 'move'));
  const fsResult = calculateDamage(attacker, defender2, fs.move, weather);
  const calcRecord: BattleLogEntry['damageCalc'] = {
    moveName: fs.move.displayName, attackerName: fs.attackerDisplayName,
    power: fs.move.power ?? 120, category: fs.move.damageClass,
    atkStat: fsResult.atkStatEffective, defStat: fsResult.defStatEffective,
    atkStage: fsResult.atkStage, defStage: fsResult.defStage,
    stabMult: fsResult.stabMult, effectiveness: fsResult.effectiveness,
    weatherMult: fsResult.weatherMult, abilityMult: fsResult.abilityMult,
    abilityNote: fsResult.abilityNote, isCrit: fsResult.isCrit,
    randomFactor: fsResult.randomFactor, finalDamage: fsResult.damage,
    defenderMaxHp: defender2.stats.hp,
  };
  const struck = applyDamage(defender2, fsResult.damage);
  logs.push(log(`${defender2.displayName} took ${fsResult.damage} damage!`, 'damage', calcRecord));
  if (struck.isFainted) logs.push(log(`${defender2.displayName} fainted!`, 'faint'));
  const defPokemon2 = [...defendingTeam.pokemon];
  defPokemon2[defIdx2] = struck;
  return { atk: attackingTeam, def: { ...defendingTeam, pokemon: defPokemon2 } };
}

interface BattleStore {
  battle: BattleState | null;
  history: BattleRecord[];
  startBattle: (team1: Team, team2: Team) => void;
  selectMove: (teamNum: 1 | 2, move: Move) => void;
  selectSwitch: (teamNum: 1 | 2, pokemonIndex: number) => void;
  completePivot: (teamNum: 1 | 2, pokemonIndex: number) => void;
  switchPokemon: (teamNum: 1 | 2, pokemonIndex: number) => void;
  clearBattle: () => void;
}

export const useBattleStore = create<BattleStore>()(
  persist(
    (set, get) => {
      // Shared end-of-turn processor used by both selectMove and selectSwitch.
      // t1SwitchIdx / t2SwitchIdx: voluntary switch index, or null if the team is moving instead.
      // t1Move / t2Move: the selected Move, or null if the team is switching instead.
      function runTurn(
        battle: BattleState,
        t1SwitchIdx: number | null,
        t1Move: Move | null,
        t2SwitchIdx: number | null,
        t2Move: Move | null,
      ) {
        let t1 = { ...battle.team1 };
        let t2 = { ...battle.team2 };
        const logs: BattleLogEntry[] = [];
        let currentWeather: WeatherType | null = battle.weather;
        let currentWeatherTurnsLeft = battle.weatherTurnsLeft;

        // Switches happen before moves, in speed order when both teams switch simultaneously.
        const t1Active = t1.pokemon[t1.activeIndex];
        const t2Active = t2.pokemon[t2.activeIndex];
        const t1Speed = getStagedSpeed(t1Active, currentWeather, t1.tailwindTurns > 0);
        const t2Speed = getStagedSpeed(t2Active, currentWeather, t2.tailwindTurns > 0);
        const t1First = t1Speed > t2Speed || (t1Speed === t2Speed && Math.random() < 0.5);

        if (t1SwitchIdx !== null && t2SwitchIdx !== null) {
          // Both switching — speed order
          if (t1First) {
            const r1 = applyVoluntarySwitch(t1, t2, t1SwitchIdx, currentWeather, currentWeatherTurnsLeft, logs);
            t1 = r1.team; t2 = r1.opponent; currentWeather = r1.weather; currentWeatherTurnsLeft = r1.weatherTurnsLeft;
            const r2 = applyVoluntarySwitch(t2, t1, t2SwitchIdx, currentWeather, currentWeatherTurnsLeft, logs);
            t2 = r2.team; t1 = r2.opponent; currentWeather = r2.weather; currentWeatherTurnsLeft = r2.weatherTurnsLeft;
          } else {
            const r1 = applyVoluntarySwitch(t2, t1, t2SwitchIdx, currentWeather, currentWeatherTurnsLeft, logs);
            t2 = r1.team; t1 = r1.opponent; currentWeather = r1.weather; currentWeatherTurnsLeft = r1.weatherTurnsLeft;
            const r2 = applyVoluntarySwitch(t1, t2, t1SwitchIdx, currentWeather, currentWeatherTurnsLeft, logs);
            t1 = r2.team; t2 = r2.opponent; currentWeather = r2.weather; currentWeatherTurnsLeft = r2.weatherTurnsLeft;
          }
        } else if (t1SwitchIdx !== null && t2Move !== null) {
          // T1 switches, T2 moves — switch always before opponent's move
          const sw = applyVoluntarySwitch(t1, t2, t1SwitchIdx, currentWeather, currentWeatherTurnsLeft, logs);
          t1 = sw.team; t2 = sw.opponent; currentWeather = sw.weather; currentWeatherTurnsLeft = sw.weatherTurnsLeft;
          const r = runOneTurn(t2, t1, t2Move, t2.name, logs, currentWeather, currentWeatherTurnsLeft);
          t2 = r.atk; t1 = r.def; currentWeather = r.weather; currentWeatherTurnsLeft = r.weatherTurnsLeft;
        } else if (t2SwitchIdx !== null && t1Move !== null) {
          // T2 switches, T1 moves — switch always before opponent's move
          const sw = applyVoluntarySwitch(t2, t1, t2SwitchIdx, currentWeather, currentWeatherTurnsLeft, logs);
          t2 = sw.team; t1 = sw.opponent; currentWeather = sw.weather; currentWeatherTurnsLeft = sw.weatherTurnsLeft;
          const r = runOneTurn(t1, t2, t1Move, t1.name, logs, currentWeather, currentWeatherTurnsLeft);
          t1 = r.atk; t2 = r.def; currentWeather = r.weather; currentWeatherTurnsLeft = r.weatherTurnsLeft;
        } else if (t1Move !== null && t2Move !== null) {
          // Both moving — speed order
          // Helper: check if a pivot switch should interrupt the turn after the first attacker moves
          const shouldPivot = (atkTeam: BattleTeam, defTeam: BattleTeam, usedMove: Move) => {
            const atkActive = atkTeam.pokemon[atkTeam.activeIndex];
            const defActive = defTeam.pokemon[defTeam.activeIndex];
            return PIVOT_MOVES.has(usedMove.name)
              && !atkActive.isFainted
              && !defActive.isFainted   // if defender fainted, handle as normal KO instead
              && atkTeam.pokemon.some((p, i) => i !== atkTeam.activeIndex && !p.isFainted);
          };

          if (t1First) {
            const r1 = runOneTurn(t1, t2, t1Move, t1.name, logs, currentWeather, currentWeatherTurnsLeft);
            t1 = r1.atk; t2 = r1.def; currentWeather = r1.weather; currentWeatherTurnsLeft = r1.weatherTurnsLeft;
            if (shouldPivot(t1, t2, t1Move)) {
              // Pause: let team1 pick a replacement before team2 attacks
              logs.push(log(`${t1.name} is switching out!`, 'switch'));
              set({ battle: { ...battle, team1: t1, team2: t2, phase: 'pivot-team1', turn: battle.turn, team1SelectedMove: null, team2SelectedMove: null, team1SelectedSwitch: null, pivotPendingMove: t2Move, pivotPendingTeam: 2, log: [...battle.log, ...logs], weather: currentWeather, weatherTurnsLeft: currentWeatherTurnsLeft } });
              return;
            }
            if (!t1.pokemon[t1.activeIndex].isFainted && !t2.pokemon[t2.activeIndex].isFainted) {
              const r2 = runOneTurn(t2, t1, t2Move, t2.name, logs, currentWeather, currentWeatherTurnsLeft);
              t2 = r2.atk; t1 = r2.def; currentWeather = r2.weather; currentWeatherTurnsLeft = r2.weatherTurnsLeft;
            }
          } else {
            const r1 = runOneTurn(t2, t1, t2Move, t2.name, logs, currentWeather, currentWeatherTurnsLeft);
            t2 = r1.atk; t1 = r1.def; currentWeather = r1.weather; currentWeatherTurnsLeft = r1.weatherTurnsLeft;
            if (shouldPivot(t2, t1, t2Move)) {
              // Pause: let team2 pick a replacement before team1 attacks
              logs.push(log(`${t2.name} is switching out!`, 'switch'));
              set({ battle: { ...battle, team1: t1, team2: t2, phase: 'pivot-team2', turn: battle.turn, team1SelectedMove: null, team2SelectedMove: null, team1SelectedSwitch: null, pivotPendingMove: t1Move, pivotPendingTeam: 1, log: [...battle.log, ...logs], weather: currentWeather, weatherTurnsLeft: currentWeatherTurnsLeft } });
              return;
            }
            if (!t1.pokemon[t1.activeIndex].isFainted && !t2.pokemon[t2.activeIndex].isFainted) {
              const r2 = runOneTurn(t1, t2, t1Move, t1.name, logs, currentWeather, currentWeatherTurnsLeft);
              t1 = r2.atk; t2 = r2.def; currentWeather = r2.weather; currentWeatherTurnsLeft = r2.weatherTurnsLeft;
            }
          }
        }

        // End-of-turn status tick
        t1 = { ...t1, pokemon: t1.pokemon.map(p => applyEndOfTurnStatus(p, logs)) };
        t2 = { ...t2, pokemon: t2.pokemon.map(p => applyEndOfTurnStatus(p, logs)) };

        // Weather chip damage then decrement
        const weatherTickResult = applyWeatherTick(t1, t2, currentWeather, logs);
        t1 = weatherTickResult.t1; t2 = weatherTickResult.t2;
        if (currentWeather) {
          currentWeatherTurnsLeft--;
          if (currentWeatherTurnsLeft <= 0) {
            logs.push(log(WEATHER_END[currentWeather], 'status'));
            currentWeather = null; currentWeatherTurnsLeft = 0;
          }
        }

        // End-of-turn abilities (Speed Boost, Rain Dish, etc.)
        t1 = applyEndOfTurnAbilities(t1, currentWeather, logs);
        t2 = applyEndOfTurnAbilities(t2, currentWeather, logs);

        // Tailwind countdown
        if (t1.tailwindTurns > 0) {
          t1 = { ...t1, tailwindTurns: t1.tailwindTurns - 1 };
          if (t1.tailwindTurns === 0) logs.push(log(`${t1.name}'s Tailwind faded!`, 'status'));
        }
        if (t2.tailwindTurns > 0) {
          t2 = { ...t2, tailwindTurns: t2.tailwindTurns - 1 };
          if (t2.tailwindTurns === 0) logs.push(log(`${t2.name}'s Tailwind faded!`, 'status'));
        }

        // Future Sight
        const fs1 = applyFutureSightForTeam(t1, t2, currentWeather, logs);
        t1 = fs1.atk; t2 = fs1.def;
        const fs2 = applyFutureSightForTeam(t2, t1, currentWeather, logs);
        t2 = fs2.atk; t1 = fs2.def;

        const t1AllFainted = t1.pokemon.every(p => p.isFainted);
        const t2AllFainted = t2.pokemon.every(p => p.isFainted);

        if (t1AllFainted || t2AllFainted) {
          const winner = t2AllFainted ? 'team1' : 'team2';
          const winnerName = winner === 'team1' ? t1.name : t2.name;
          logs.push(log(`${winnerName} wins!`, 'info'));
          const record: BattleRecord = {
            id: crypto.randomUUID(), date: new Date().toISOString(),
            team1Name: t1.name, team2Name: t2.name, winner: winnerName, turns: battle.turn,
          };
          set((s) => ({
            battle: {
              ...battle,
              team1: t1, team2: t2,
              phase: 'game-over',
              turn: battle.turn + 1,
              team1SelectedMove: null, team2SelectedMove: null, team1SelectedSwitch: null, pivotPendingMove: null, pivotPendingTeam: null,
              log: [...battle.log, ...logs],
              winner,
              weather: currentWeather, weatherTurnsLeft: currentWeatherTurnsLeft,
            },
            history: [record, ...s.history].slice(0, 50),
          }));
          return;
        }

        let phase: BattleState['phase'] = 'team1-move';
        if (t1.pokemon[t1.activeIndex].isFainted) {
          phase = 'switch-team1';
          logs.push(log(`${t1.name} must switch Pokemon!`, 'switch'));
        } else if (t2.pokemon[t2.activeIndex].isFainted) {
          phase = 'switch-team2';
          logs.push(log(`${t2.name} must switch Pokemon!`, 'switch'));
        }

        set({
          battle: {
            ...battle,
            team1: t1, team2: t2,
            phase,
            turn: battle.turn + 1,
            team1SelectedMove: null, team2SelectedMove: null, team1SelectedSwitch: null,
            log: [...battle.log, ...logs],
            weather: currentWeather, weatherTurnsLeft: currentWeatherTurnsLeft,
          },
        });
      }

      return {
      battle: null,
      history: [],

      startBattle: (team1, team2) => {
        let bt1 = initBattleTeam(team1);
        let bt2 = initBattleTeam(team2);
        const logs: BattleLogEntry[] = [log(`Battle start! ${team1.name} vs ${team2.name}!`, 'info')];
        let weather: WeatherType | null = null;
        let weatherTurnsLeft = 0;

        // Apply entry abilities for both leads (t1 first, then t2)
        let t1Active = bt1.pokemon[bt1.activeIndex];
        let t2Active = bt2.pokemon[bt2.activeIndex];

        const r1 = applyEntryAbility(t1Active, t2Active, weather, weatherTurnsLeft, logs);
        t1Active = r1.incoming; t2Active = r1.opponent;
        weather = r1.weather; weatherTurnsLeft = r1.weatherTurnsLeft;

        const r2 = applyEntryAbility(t2Active, t1Active, weather, weatherTurnsLeft, logs);
        t2Active = r2.incoming; t1Active = r2.opponent;
        weather = r2.weather; weatherTurnsLeft = r2.weatherTurnsLeft;

        const t1Pokemon = [...bt1.pokemon]; t1Pokemon[bt1.activeIndex] = t1Active;
        const t2Pokemon = [...bt2.pokemon]; t2Pokemon[bt2.activeIndex] = t2Active;
        bt1 = { ...bt1, pokemon: t1Pokemon };
        bt2 = { ...bt2, pokemon: t2Pokemon };

        set({
          battle: {
            team1: bt1,
            team2: bt2,
            phase: 'team1-move',
            turn: 1,
            team1SelectedMove: null,
            team2SelectedMove: null,
            team1SelectedSwitch: null,
            pivotPendingMove: null,
            pivotPendingTeam: null,
            log: logs,
            winner: null,
            weather,
            weatherTurnsLeft,
          },
        });
      },

      selectMove: (teamNum, move) => {
        const { battle } = get();
        if (!battle) return;

        if (teamNum === 1) {
          if (battle.phase !== 'team1-move') return;
          const t1Active = battle.team1.pokemon[battle.team1.activeIndex];
          const actualMove = t1Active.lockedMove ?? t1Active.chargingMove ?? move;
          set({ battle: { ...battle, team1SelectedMove: actualMove, team1SelectedSwitch: null, phase: 'team2-move' } });
          return;
        }

        if (battle.phase !== 'team2-move') return;
        const t2ActivePre = battle.team2.pokemon[battle.team2.activeIndex];
        const t2Move = t2ActivePre.lockedMove ?? t2ActivePre.chargingMove ?? move;
        runTurn(battle, battle.team1SelectedSwitch, battle.team1SelectedMove, null, t2Move);
      },

      selectSwitch: (teamNum, pokemonIndex) => {
        const { battle } = get();
        if (!battle) return;

        if (teamNum === 1) {
          // Store switch intent; opponent selects their action next
          if (battle.phase !== 'team1-move') return;
          set({ battle: { ...battle, team1SelectedSwitch: pokemonIndex, team1SelectedMove: null, phase: 'team2-move' } });
          return;
        }

        // Team 2 is switching — run the full turn now
        if (battle.phase !== 'team2-move') return;
        runTurn(battle, battle.team1SelectedSwitch, battle.team1SelectedMove, pokemonIndex, null);
      },

      completePivot: (teamNum, pokemonIndex) => {
        const { battle } = get();
        if (!battle) return;
        const expectedPhase = teamNum === 1 ? 'pivot-team1' : 'pivot-team2';
        if (battle.phase !== expectedPhase) return;

        const logs: BattleLogEntry[] = [];
        let currentWeather = battle.weather;
        let currentWeatherTurnsLeft = battle.weatherTurnsLeft;

        // Apply the pivot switch
        let t1 = battle.team1, t2 = battle.team2;
        if (teamNum === 1) {
          const sw = applyVoluntarySwitch(t1, t2, pokemonIndex, currentWeather, currentWeatherTurnsLeft, logs);
          t1 = sw.team; t2 = sw.opponent; currentWeather = sw.weather; currentWeatherTurnsLeft = sw.weatherTurnsLeft;
        } else {
          const sw = applyVoluntarySwitch(t2, t1, pokemonIndex, currentWeather, currentWeatherTurnsLeft, logs);
          t2 = sw.team; t1 = sw.opponent; currentWeather = sw.weather; currentWeatherTurnsLeft = sw.weatherTurnsLeft;
        }

        // Run the pending second attacker's move (if the defender is still alive)
        if (battle.pivotPendingMove && battle.pivotPendingTeam && !t1.pokemon[t1.activeIndex].isFainted && !t2.pokemon[t2.activeIndex].isFainted) {
          const pendingTeam = battle.pivotPendingTeam;
          const r = pendingTeam === 1
            ? runOneTurn(t1, t2, battle.pivotPendingMove, t1.name, logs, currentWeather, currentWeatherTurnsLeft)
            : runOneTurn(t2, t1, battle.pivotPendingMove, t2.name, logs, currentWeather, currentWeatherTurnsLeft);
          if (pendingTeam === 1) { t1 = r.atk; t2 = r.def; }
          else { t2 = r.atk; t1 = r.def; }
          currentWeather = r.weather; currentWeatherTurnsLeft = r.weatherTurnsLeft;
        }

        // End-of-turn processing (same as runTurn's tail)
        t1 = { ...t1, pokemon: t1.pokemon.map(p => applyEndOfTurnStatus(p, logs)) };
        t2 = { ...t2, pokemon: t2.pokemon.map(p => applyEndOfTurnStatus(p, logs)) };
        const weatherTick = applyWeatherTick(t1, t2, currentWeather, logs);
        t1 = weatherTick.t1; t2 = weatherTick.t2;
        if (currentWeather) {
          currentWeatherTurnsLeft--;
          if (currentWeatherTurnsLeft <= 0) {
            logs.push(log(WEATHER_END[currentWeather], 'status'));
            currentWeather = null; currentWeatherTurnsLeft = 0;
          }
        }
        t1 = applyEndOfTurnAbilities(t1, currentWeather, logs);
        t2 = applyEndOfTurnAbilities(t2, currentWeather, logs);
        if (t1.tailwindTurns > 0) { t1 = { ...t1, tailwindTurns: t1.tailwindTurns - 1 }; if (t1.tailwindTurns === 0) logs.push(log(`${t1.name}'s Tailwind faded!`, 'status')); }
        if (t2.tailwindTurns > 0) { t2 = { ...t2, tailwindTurns: t2.tailwindTurns - 1 }; if (t2.tailwindTurns === 0) logs.push(log(`${t2.name}'s Tailwind faded!`, 'status')); }
        const fs1 = applyFutureSightForTeam(t1, t2, currentWeather, logs); t1 = fs1.atk; t2 = fs1.def;
        const fs2 = applyFutureSightForTeam(t2, t1, currentWeather, logs); t2 = fs2.atk; t1 = fs2.def;

        const t1AllFainted = t1.pokemon.every(p => p.isFainted);
        const t2AllFainted = t2.pokemon.every(p => p.isFainted);
        if (t1AllFainted || t2AllFainted) {
          const winner = t2AllFainted ? 'team1' : 'team2';
          const winnerName = winner === 'team1' ? t1.name : t2.name;
          logs.push(log(`${winnerName} wins!`, 'info'));
          const record: BattleRecord = { id: crypto.randomUUID(), date: new Date().toISOString(), team1Name: t1.name, team2Name: t2.name, winner: winnerName, turns: battle.turn };
          set((s) => ({ battle: { ...battle, team1: t1, team2: t2, phase: 'game-over', turn: battle.turn + 1, team1SelectedMove: null, team2SelectedMove: null, team1SelectedSwitch: null, pivotPendingMove: null, pivotPendingTeam: null, log: [...battle.log, ...logs], winner, weather: currentWeather, weatherTurnsLeft: currentWeatherTurnsLeft }, history: [record, ...s.history].slice(0, 50) }));
          return;
        }

        let phase: BattleState['phase'] = 'team1-move';
        if (t1.pokemon[t1.activeIndex].isFainted) { phase = 'switch-team1'; logs.push(log(`${t1.name} must switch Pokemon!`, 'switch')); }
        else if (t2.pokemon[t2.activeIndex].isFainted) { phase = 'switch-team2'; logs.push(log(`${t2.name} must switch Pokemon!`, 'switch')); }

        set({ battle: { ...battle, team1: t1, team2: t2, phase, turn: battle.turn + 1, team1SelectedMove: null, team2SelectedMove: null, team1SelectedSwitch: null, pivotPendingMove: null, pivotPendingTeam: null, log: [...battle.log, ...logs], weather: currentWeather, weatherTurnsLeft: currentWeatherTurnsLeft } });
      },

      switchPokemon: (teamNum, pokemonIndex) => {
        const { battle } = get();
        if (!battle) return;
        const logs: BattleLogEntry[] = [];
        let weather = battle.weather;
        let weatherTurnsLeft = battle.weatherTurnsLeft;

        if (teamNum === 1) {
          const newPokemon = battle.team1.pokemon[pokemonIndex];
          logs.push(log(`${battle.team1.name} sent out ${newPokemon.displayName}!`, 'switch'));
          const outIdx1 = battle.team1.activeIndex;
          const resetPokemon = battle.team1.pokemon.map((p, i) => {
            if (i === pokemonIndex) return { ...p, stages: { ...ZERO_STAGES } };
            if (i === outIdx1) return { ...p, chargingMove: null, isInvulnerable: false, substituteHp: null, lockedMove: null, lockedTurns: 0 };
            return p;
          });
          let t1 = { ...battle.team1, activeIndex: pokemonIndex, pokemon: resetPokemon };
          let t2 = battle.team2;
          // Apply entry ability of the incoming Pokemon
          const entryResult = applyEntryAbility(t1.pokemon[pokemonIndex], t2.pokemon[t2.activeIndex], weather, weatherTurnsLeft, logs);
          const t1p = [...t1.pokemon]; t1p[pokemonIndex] = entryResult.incoming;
          const t2p = [...t2.pokemon]; t2p[t2.activeIndex] = entryResult.opponent;
          t1 = { ...t1, pokemon: t1p };
          t2 = { ...t2, pokemon: t2p };
          weather = entryResult.weather; weatherTurnsLeft = entryResult.weatherTurnsLeft;
          const t2Fainted = t2.pokemon[t2.activeIndex].isFainted;
          const phase: BattleState['phase'] = (battle.phase === 'switch-team1' && t2Fainted) ? 'switch-team2' : 'team1-move';
          set({ battle: { ...battle, team1: t1, team2: t2, phase, weather, weatherTurnsLeft, log: [...battle.log, ...logs] } });
        } else {
          const newPokemon = battle.team2.pokemon[pokemonIndex];
          logs.push(log(`${battle.team2.name} sent out ${newPokemon.displayName}!`, 'switch'));
          const outIdx2 = battle.team2.activeIndex;
          const resetPokemon = battle.team2.pokemon.map((p, i) => {
            if (i === pokemonIndex) return { ...p, stages: { ...ZERO_STAGES } };
            if (i === outIdx2) return { ...p, chargingMove: null, isInvulnerable: false, substituteHp: null, lockedMove: null, lockedTurns: 0 };
            return p;
          });
          let t2 = { ...battle.team2, activeIndex: pokemonIndex, pokemon: resetPokemon };
          let t1 = battle.team1;
          // Apply entry ability of the incoming Pokemon
          const entryResult = applyEntryAbility(t2.pokemon[pokemonIndex], t1.pokemon[t1.activeIndex], weather, weatherTurnsLeft, logs);
          const t2p = [...t2.pokemon]; t2p[pokemonIndex] = entryResult.incoming;
          const t1p = [...t1.pokemon]; t1p[t1.activeIndex] = entryResult.opponent;
          t2 = { ...t2, pokemon: t2p };
          t1 = { ...t1, pokemon: t1p };
          weather = entryResult.weather; weatherTurnsLeft = entryResult.weatherTurnsLeft;
          set({ battle: { ...battle, team1: t1, team2: t2, phase: 'team1-move', weather, weatherTurnsLeft, log: [...battle.log, ...logs] } });
        }
      },

      clearBattle: () => set({ battle: null }),
      }; // end return
    },
    { name: 'pokemon-battle-state', partialize: (s) => ({ history: s.history }) }
  )
);
