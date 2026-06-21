import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  BattleState, BattleTeam, BattlePokemon, Move, Team,
  StatusCondition, BattleRecord, BattleLogEntry, WeatherType, PokemonStats
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
  if (p.status === 'sleep') {
    if (p.sleepTurns <= 0) {
      logs.push(log(`${p.displayName} woke up!`, 'status'));
      return { pokemon: { ...p, status: 'none', sleepTurns: 0 }, canMove: true };
    }
    logs.push(log(`${p.displayName} is fast asleep...`, 'status'));
    return { pokemon: { ...p, sleepTurns: p.sleepTurns - 1 }, canMove: false };
  }
  if (p.status === 'freeze') {
    if (Math.random() < 0.2) {
      logs.push(log(`${p.displayName} thawed out!`, 'status'));
      return { pokemon: { ...p, status: 'none' }, canMove: true };
    }
    logs.push(log(`${p.displayName} is frozen solid!`, 'status'));
    return { pokemon: p, canMove: false };
  }
  if (p.status === 'paralysis') {
    if (Math.random() < 0.25) {
      logs.push(log(`${p.displayName} is paralyzed and can't move!`, 'status'));
      return { pokemon: p, canMove: false };
    }
  }
  if (p.status === 'confusion') {
    if (p.confusionTurns <= 0) {
      logs.push(log(`${p.displayName} snapped out of confusion!`, 'status'));
      return { pokemon: { ...p, status: 'none', confusionTurns: 0 }, canMove: true };
    }
    if (Math.random() < 0.33) {
      const selfDmg = Math.max(1, Math.floor(p.stats.hp / 8));
      logs.push(log(`${p.displayName} hurt itself in confusion!`, 'damage'));
      const hurt = applyDamage(p, selfDmg);
      return { pokemon: { ...hurt, confusionTurns: hurt.confusionTurns - 1 }, canMove: false };
    }
    return { pokemon: { ...p, confusionTurns: p.confusionTurns - 1 }, canMove: true };
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
): { atk: BattlePokemon; def: BattlePokemon; newWeather?: WeatherType } {
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
      } else if (def.status === 'none' || def.status === 'confusion') {
        logs.push(log(`${def.displayName} became confused!`, 'status'));
        def = { ...def, status: 'confusion', confusionTurns: Math.floor(Math.random() * 3) + 2 };
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
    const ailment = move.ailment as StatusCondition;
    const withStatus = applyStatus(def, ailment);
    if (withStatus.status !== def.status) {
      logs.push(log(`${def.displayName} was afflicted with ${ailment}!`, 'status'));
      def = ailment === 'sleep' ? { ...withStatus, sleepTurns: Math.floor(Math.random() * 3) + 1 } : withStatus;
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

interface BattleStore {
  battle: BattleState | null;
  history: BattleRecord[];
  startBattle: (team1: Team, team2: Team) => void;
  selectMove: (teamNum: 1 | 2, move: Move) => void;
  switchPokemon: (teamNum: 1 | 2, pokemonIndex: number) => void;
  clearBattle: () => void;
}

export const useBattleStore = create<BattleStore>()(
  persist(
    (set, get) => ({
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
          const actualMove = t1Active.chargingMove ?? move;
          set({ battle: { ...battle, team1SelectedMove: actualMove, phase: 'team2-move' } });
          return;
        }

        if (battle.phase !== 'team2-move') return;
        const t1Move = battle.team1SelectedMove!;
        const t2ActivePre = battle.team2.pokemon[battle.team2.activeIndex];
        const t2Move = t2ActivePre.chargingMove ?? move;

        let t1 = { ...battle.team1 };
        let t2 = { ...battle.team2 };
        const logs: BattleLogEntry[] = [];
        let currentWeather: WeatherType | null = battle.weather;
        let currentWeatherTurnsLeft = battle.weatherTurnsLeft;

        const t1Active = t1.pokemon[t1.activeIndex];
        const t2Active = t2.pokemon[t2.activeIndex];

        const t1Speed = getStagedSpeed(t1Active, currentWeather);
        const t2Speed = getStagedSpeed(t2Active, currentWeather);
        const t1First = t1Speed > t2Speed || (t1Speed === t2Speed && Math.random() < 0.5);

        const executeTurn = (
          atk: BattleTeam, def: BattleTeam, atkMove: Move, isT1: boolean
        ): { atk: BattleTeam; def: BattleTeam } => {
          const atkIdx = atk.activeIndex;
          const defIdx = def.activeIndex;

          let atkPokemon = atk.pokemon[atkIdx];
          if (atkPokemon.isFainted) return { atk, def };

          // Capture charging state before status resolution (status doesn't affect it)
          const moveToUse = atkPokemon.chargingMove ?? atkMove;
          const wasCharging = !!atkPokemon.chargingMove;

          const { pokemon: resolved, canMove } = resolveStatusEffect(atkPokemon, logs);
          atkPokemon = resolved;
          const updatedAtkPokemon = [...atk.pokemon];
          updatedAtkPokemon[atkIdx] = atkPokemon;
          atk = { ...atk, pokemon: updatedAtkPokemon };

          if (!canMove || atkPokemon.isFainted) return { atk, def };

          // Decrement PP on the turn the move is chosen (not the auto-release turn)
          if (!wasCharging) {
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
          const teamLabel = `${isT1 ? t1.name : t2.name}'s ${atkPokemon.displayName}`;

          // CHARGE TURN: two-turn move used fresh (not already charging, and not solar-beam in sun)
          const twoTurnInfo = TWO_TURN_MOVES[moveToUse.name];
          const isSolarInstant = moveToUse.name === 'solar-beam' && currentWeather === 'sunny';
          if (twoTurnInfo && !wasCharging && !isSolarInstant) {
            logs.push(log(`${teamLabel} ${twoTurnInfo.chargeMsg}`, 'move'));
            let charged: BattlePokemon = { ...atkPokemon, chargingMove: moveToUse, isInvulnerable: twoTurnInfo.invulnerable };
            if (moveToUse.name === 'skull-bash') charged = applyStatChanges(charged, [{ stat: 'defense', change: 1 }], logs);
            if (moveToUse.name === 'meteor-beam') charged = applyStatChanges(charged, [{ stat: 'specialAttack', change: 1 }], logs);
            const arr = [...atk.pokemon]; arr[atkIdx] = charged;
            return { atk: { ...atk, pokemon: arr }, def };
          }

          // MISS: defender is invulnerable (underground/in-air)
          if (defPokemon.isInvulnerable) {
            const chargeName = defPokemon.chargingMove?.name ?? '';
            const loc = (chargeName === 'dig' || chargeName === 'dive') ? 'underground' : 'in the air';
            logs.push(log(`The attack missed! ${defPokemon.displayName} is ${loc}!`, 'info'));
            return { atk, def };
          }

          // RELEASE TURN: clear charging state before executing the stored move
          if (wasCharging) {
            atkPokemon = { ...atkPokemon, chargingMove: null, isInvulnerable: false };
            const arr = [...atk.pokemon]; arr[atkIdx] = atkPokemon;
            atk = { ...atk, pokemon: arr };
          }

          const result = executeMove(atkPokemon, defPokemon, moveToUse, teamLabel, logs, currentWeather);
          // Propagate weather change immediately so the second move sees it
          if (result.newWeather !== undefined) {
            currentWeather = result.newWeather;
            currentWeatherTurnsLeft = 5;
          }
          const updatedAtkArr = [...atk.pokemon];
          updatedAtkArr[atkIdx] = result.atk;
          atk = { ...atk, pokemon: updatedAtkArr };
          const updatedDefArr = [...def.pokemon];
          updatedDefArr[defIdx] = result.def;
          def = { ...def, pokemon: updatedDefArr };

          return { atk, def };
        };

        let firstAtk: BattleTeam, firstDef: BattleTeam, firstMove: Move, firstIsT1: boolean;
        let secondAtk: BattleTeam, secondDef: BattleTeam, secondMove: Move, secondIsT1: boolean;

        if (t1First) {
          firstAtk = t1; firstDef = t2; firstMove = t1Move; firstIsT1 = true;
          secondAtk = t2; secondDef = t1; secondMove = t2Move; secondIsT1 = false;
        } else {
          firstAtk = t2; firstDef = t1; firstMove = t2Move; firstIsT1 = false;
          secondAtk = t1; secondDef = t2; secondMove = t1Move; secondIsT1 = true;
        }

        const r1 = executeTurn(firstAtk, firstDef, firstMove, firstIsT1);
        if (t1First) { t1 = r1.atk; t2 = r1.def; } else { t2 = r1.atk; t1 = r1.def; }

        if (!t1.pokemon[t1.activeIndex].isFainted && !t2.pokemon[t2.activeIndex].isFainted) {
          if (t1First) {
            secondAtk = t2; secondDef = t1;
          } else {
            secondAtk = t1; secondDef = t2;
          }
          const r2 = executeTurn(secondAtk, secondDef, secondMove, secondIsT1);
          if (t1First) { t2 = r2.atk; t1 = r2.def; } else { t1 = r2.atk; t2 = r2.def; }
        }

        t1 = { ...t1, pokemon: t1.pokemon.map(p => applyEndOfTurnStatus(p, logs)) };
        t2 = { ...t2, pokemon: t2.pokemon.map(p => applyEndOfTurnStatus(p, logs)) };

        // Weather chip damage (sandstorm/hail) then decrement counter
        const weatherTickResult = applyWeatherTick(t1, t2, currentWeather, logs);
        t1 = weatherTickResult.t1;
        t2 = weatherTickResult.t2;
        if (currentWeather) {
          currentWeatherTurnsLeft--;
          if (currentWeatherTurnsLeft <= 0) {
            logs.push(log(WEATHER_END[currentWeather], 'status'));
            currentWeather = null;
            currentWeatherTurnsLeft = 0;
          }
        }

        // End-of-turn ability effects
        const applyEndOfTurnAbilities = (team: BattleTeam): BattleTeam => {
          const idx = team.activeIndex;
          let p = team.pokemon[idx];
          if (p.isFainted) return team;
          // Speed Boost: +1 SPD each turn
          if (p.ability === 'speed-boost') {
            p = applyStatChanges(p, [{ stat: 'speed', change: 1 }], logs);
          }
          // Rain Dish: heal 1/16 HP in rain
          if (p.ability === 'rain-dish' && currentWeather === 'rain') {
            const heal = Math.max(1, Math.floor(p.stats.hp / 16));
            if (p.currentHp < p.stats.hp) {
              p = { ...p, currentHp: Math.min(p.stats.hp, p.currentHp + heal) };
              logs.push(log(`${p.displayName} restored a little HP using Rain Dish!`, 'status'));
            }
          }
          const newPokemon = [...team.pokemon];
          newPokemon[idx] = p;
          return { ...team, pokemon: newPokemon };
        };
        t1 = applyEndOfTurnAbilities(t1);
        t2 = applyEndOfTurnAbilities(t2);

        const t1AllFainted = t1.pokemon.every(p => p.isFainted);
        const t2AllFainted = t2.pokemon.every(p => p.isFainted);

        if (t1AllFainted || t2AllFainted) {
          const winner = t2AllFainted ? 'team1' : 'team2';
          const winnerName = winner === 'team1' ? t1.name : t2.name;
          logs.push(log(`${winnerName} wins!`, 'info'));
          const record: BattleRecord = {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            team1Name: t1.name,
            team2Name: t2.name,
            winner: winnerName,
            turns: battle.turn,
          };
          set((s) => ({
            battle: {
              ...battle,
              team1: t1, team2: t2,
              phase: 'game-over',
              turn: battle.turn + 1,
              team1SelectedMove: null,
              team2SelectedMove: null,
              log: [...battle.log, ...logs],
              winner,
              weather: currentWeather,
              weatherTurnsLeft: currentWeatherTurnsLeft,
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
            team1: t1,
            team2: t2,
            phase,
            turn: battle.turn + 1,
            team1SelectedMove: null,
            team2SelectedMove: null,
            log: [...battle.log, ...logs],
            weather: currentWeather,
            weatherTurnsLeft: currentWeatherTurnsLeft,
          },
        });
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
            if (i === outIdx1) return { ...p, chargingMove: null, isInvulnerable: false, substituteHp: null };
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
            if (i === outIdx2) return { ...p, chargingMove: null, isInvulnerable: false, substituteHp: null };
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
    }),
    { name: 'pokemon-battle-state', partialize: (s) => ({ history: s.history }) }
  )
);
