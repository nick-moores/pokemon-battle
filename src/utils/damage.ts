import { BattlePokemon, Move, Stages, WeatherType } from '../types';
import { getTypeEffectiveness } from '../data/typeChart';

const LEVEL = 50;

export interface DamageResult {
  damage: number;
  effectiveness: number;
  isStab: boolean;
  isCrit: boolean;
}

// Stage formula: multiplier = max(2, 2+stage) / max(2, 2-stage)
// Gives: -6=0.25, -5≈0.286, -4≈0.333, -3=0.4, -2=0.5, -1≈0.667, 0=1, +1=1.5, +2=2, +3=2.5, +4=3, +5=3.5, +6=4
export function getStageMultiplier(stage: number): number {
  return Math.max(2, 2 + stage) / Math.max(2, 2 - stage);
}

export function getStagedStat(baseStat: number, stage: number): number {
  return Math.max(1, Math.floor(baseStat * getStageMultiplier(stage)));
}

export function getStagedSpeed(pokemon: BattlePokemon, weather: WeatherType | null = null): number {
  let base = pokemon.status === 'paralysis'
    ? Math.floor(pokemon.stats.speed * 0.5)
    : pokemon.stats.speed;
  if (weather === 'rain' && pokemon.ability === 'swift-swim') base *= 2;
  if (weather === 'sunny' && pokemon.ability === 'chlorophyll') base *= 2;
  if (weather === 'sandstorm' && pokemon.ability === 'sand-rush') base *= 2;
  return getStagedStat(base, pokemon.stages?.speed ?? 0);
}

export function getWeatherMultiplier(weather: WeatherType | null, moveType: string): number {
  if (weather === 'sunny' && moveType === 'fire') return 1.5;
  if (weather === 'sunny' && moveType === 'water') return 0.5;
  if (weather === 'rain' && moveType === 'water') return 1.5;
  if (weather === 'rain' && moveType === 'fire') return 0.5;
  return 1;
}

export function calculateDamage(attacker: BattlePokemon, defender: BattlePokemon, move: Move, weather: WeatherType | null = null): DamageResult {
  if (move.damageClass === 'status') {
    return { damage: 0, effectiveness: 1, isStab: false, isCrit: false };
  }
  if (move.category === 'ohko') {
    return { damage: defender.currentHp, effectiveness: 1, isStab: false, isCrit: false };
  }
  if (!move.power || move.power === 0) {
    return { damage: 0, effectiveness: 1, isStab: false, isCrit: false };
  }

  const atkStage = move.damageClass === 'special'
    ? (attacker.stages?.specialAttack ?? 0)
    : (attacker.stages?.attack ?? 0);
  const defStage = move.damageClass === 'special'
    ? (defender.stages?.specialDefense ?? 0)
    : (defender.stages?.defense ?? 0);

  const isCrit = Math.random() < 0.0625;
  // Crits ignore attacker's negative stages and defender's positive stages
  const effectiveAtkStage = isCrit ? Math.max(0, atkStage) : atkStage;
  const effectiveDefStage = isCrit ? Math.min(0, defStage) : defStage;

  // Huge Power / Pure Power double the base Attack before stage calc
  let baseAtk = move.damageClass === 'special' ? attacker.stats.specialAttack : attacker.stats.attack;
  if (move.damageClass === 'physical' &&
      (attacker.ability === 'huge-power' || attacker.ability === 'pure-power')) {
    baseAtk *= 2;
  }

  let atkStat = getStagedStat(baseAtk, effectiveAtkStage);
  let defStat = getStagedStat(
    move.damageClass === 'special' ? defender.stats.specialDefense : defender.stats.defense,
    effectiveDefStage
  );

  // Guts: 1.5× physical Attack when statused (burn penalty removed too)
  if (move.damageClass === 'physical' && attacker.ability === 'guts' && attacker.status !== 'none') {
    atkStat = Math.floor(atkStat * 1.5);
  } else if (move.damageClass === 'physical' && attacker.status === 'burn') {
    atkStat = Math.floor(atkStat * 0.5);
  }

  // Sandstorm boosts Rock-type Special Defense by 50%
  if (weather === 'sandstorm' && move.damageClass === 'special' && defender.types.some(t => t.toLowerCase() === 'rock')) {
    defStat = Math.floor(defStat * 1.5);
  }

  const effectiveness = getTypeEffectiveness(move.type, defender.types);
  if (effectiveness === 0) return { damage: 0, effectiveness: 0, isStab: false, isCrit: false };

  const isStab = attacker.types.includes(move.type.toLowerCase());
  const stabMult = isStab ? (attacker.ability === 'adaptability' ? 2.0 : 1.5) : 1;
  const critMult = isCrit ? 1.5 : 1;
  const weatherMult = getWeatherMultiplier(weather, move.type.toLowerCase());
  const flashFireMult = (attacker.ability === 'flash-fire' && attacker.flashFireActive && move.type.toLowerCase() === 'fire') ? 1.5 : 1;
  const randomFactor = (Math.floor(Math.random() * 16) + 85) / 100;

  const base = Math.floor((2 * LEVEL / 5 + 2) * move.power * atkStat / defStat);
  const damage = Math.max(1, Math.floor((Math.floor(base / 50) + 2) * stabMult * effectiveness * critMult * weatherMult * flashFireMult * randomFactor));

  return { damage, effectiveness, isStab, isCrit };
}

export interface DamageBreakdown {
  power: number;
  category: string;
  atkStatRaw: number;
  atkStatEffective: number;
  defStatRaw: number;
  defStatEffective: number;
  atkStage: number;
  defStage: number;
  isStab: boolean;
  stabMult: number;
  effectiveness: number;
  weatherMult: number;
  abilityNote: string;
  minDamage: number;
  maxDamage: number;
  critMax: number;
  defenderMaxHp: number;
}

export function getDamageBreakdown(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  weather: WeatherType | null = null,
): DamageBreakdown | null {
  if (move.damageClass === 'status' || !move.power) return null;
  if (move.category === 'ohko') {
    return {
      power: 0, category: move.damageClass,
      atkStatRaw: 0, atkStatEffective: 0, defStatRaw: 0, defStatEffective: 0,
      atkStage: 0, defStage: 0, isStab: false, stabMult: 1, effectiveness: 1,
      weatherMult: 1, abilityNote: 'One-Hit KO move',
      minDamage: defender.currentHp, maxDamage: defender.currentHp, critMax: defender.currentHp,
      defenderMaxHp: defender.stats.hp,
    };
  }

  const atkStage = move.damageClass === 'special'
    ? (attacker.stages?.specialAttack ?? 0)
    : (attacker.stages?.attack ?? 0);
  const defStage = move.damageClass === 'special'
    ? (defender.stages?.specialDefense ?? 0)
    : (defender.stages?.defense ?? 0);

  let abilityNote = '';
  let baseAtk = move.damageClass === 'special' ? attacker.stats.specialAttack : attacker.stats.attack;
  if (move.damageClass === 'physical' &&
      (attacker.ability === 'huge-power' || attacker.ability === 'pure-power')) {
    baseAtk *= 2;
    abilityNote = 'Huge Power (×2 Atk)';
  }

  let atkStat = getStagedStat(baseAtk, atkStage);
  let defStat = getStagedStat(
    move.damageClass === 'special' ? defender.stats.specialDefense : defender.stats.defense,
    defStage
  );

  if (move.damageClass === 'physical' && attacker.ability === 'guts' && attacker.status !== 'none') {
    atkStat = Math.floor(atkStat * 1.5);
    abilityNote = 'Guts (×1.5 Atk)';
  } else if (move.damageClass === 'physical' && attacker.status === 'burn') {
    atkStat = Math.floor(atkStat * 0.5);
    abilityNote = 'Burn (×0.5 Atk)';
  }
  if (weather === 'sandstorm' && move.damageClass === 'special'
      && defender.types.some(t => t.toLowerCase() === 'rock')) {
    defStat = Math.floor(defStat * 1.5);
  }

  const effectiveness = getTypeEffectiveness(move.type, defender.types);
  const isStab = attacker.types.includes(move.type.toLowerCase());
  const stabMult = isStab ? (attacker.ability === 'adaptability' ? 2.0 : 1.5) : 1;
  if (isStab && attacker.ability === 'adaptability' && !abilityNote) abilityNote = 'Adaptability (×2.0 STAB)';
  const weatherMult = getWeatherMultiplier(weather, move.type.toLowerCase());
  const flashFireMult = (attacker.ability === 'flash-fire' && attacker.flashFireActive
    && move.type.toLowerCase() === 'fire') ? 1.5 : 1;
  if (flashFireMult > 1 && !abilityNote) abilityNote = 'Flash Fire (×1.5 Fire)';

  const baseRaw = Math.floor((2 * LEVEL / 5 + 2) * move.power * atkStat / defStat);
  const calc = (rand: number, crit: number) =>
    effectiveness === 0
      ? 0
      : Math.max(1, Math.floor((Math.floor(baseRaw / 50) + 2) * stabMult * effectiveness * crit * weatherMult * flashFireMult * rand));

  return {
    power: move.power,
    category: move.damageClass,
    atkStatRaw: move.damageClass === 'special' ? attacker.stats.specialAttack : attacker.stats.attack,
    atkStatEffective: atkStat,
    defStatRaw: move.damageClass === 'special' ? defender.stats.specialDefense : defender.stats.defense,
    defStatEffective: defStat,
    atkStage,
    defStage,
    isStab,
    stabMult,
    effectiveness,
    weatherMult,
    abilityNote,
    minDamage: calc(0.85, 1),
    maxDamage: calc(1.0, 1),
    critMax: calc(1.0, 1.5),
    defenderMaxHp: defender.stats.hp,
  };
}

export function getStatusTickDamage(pokemon: BattlePokemon): number {
  const max = pokemon.stats.hp;
  if (pokemon.status === 'burn' || pokemon.status === 'poison') return Math.max(1, Math.floor(max / 8));
  if (pokemon.status === 'badly-poisoned') return Math.max(1, Math.floor(max * pokemon.poisonCount / 16));
  return 0;
}

export const ZERO_STAGES: Stages = {
  attack: 0, defense: 0, specialAttack: 0, specialDefense: 0,
  speed: 0, accuracy: 0, evasion: 0,
};
