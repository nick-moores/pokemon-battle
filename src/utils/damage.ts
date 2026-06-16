import { BattlePokemon, Move } from '../types';
import { getTypeEffectiveness } from '../data/typeChart';

const LEVEL = 50;

export interface DamageResult {
  damage: number;
  effectiveness: number;
  isStab: boolean;
  isCrit: boolean;
}

export function calculateDamage(attacker: BattlePokemon, defender: BattlePokemon, move: Move): DamageResult {
  if (move.damageClass === 'status') {
    return { damage: 0, effectiveness: 1, isStab: false, isCrit: false };
  }
  // OHKO moves (Fissure, Guillotine, Horn Drill, Sheer Cold)
  if (move.category === 'ohko') {
    return { damage: defender.currentHp, effectiveness: 1, isStab: false, isCrit: false };
  }
  if (!move.power || move.power === 0) {
    return { damage: 0, effectiveness: 1, isStab: false, isCrit: false };
  }

  let atkStat = move.damageClass === 'special' ? attacker.stats.specialAttack : attacker.stats.attack;
  let defStat = move.damageClass === 'special' ? defender.stats.specialDefense : defender.stats.defense;

  if (move.damageClass === 'physical' && attacker.status === 'burn') {
    atkStat = Math.floor(atkStat * 0.5);
  }

  const effectiveness = getTypeEffectiveness(move.type, defender.types);
  if (effectiveness === 0) return { damage: 0, effectiveness: 0, isStab: false, isCrit: false };

  const isStab = attacker.types.includes(move.type.toLowerCase());
  const stabMult = isStab ? 1.5 : 1;
  const isCrit = Math.random() < 0.0625;
  const critMult = isCrit ? 1.5 : 1;
  const randomFactor = (Math.floor(Math.random() * 16) + 85) / 100;

  const base = Math.floor((2 * LEVEL / 5 + 2) * move.power * atkStat / defStat);
  const damage = Math.max(1, Math.floor((Math.floor(base / 50) + 2) * stabMult * effectiveness * critMult * randomFactor));

  return { damage, effectiveness, isStab, isCrit };
}

export function getStatusTickDamage(pokemon: BattlePokemon): number {
  const max = pokemon.stats.hp;
  if (pokemon.status === 'burn' || pokemon.status === 'poison') return Math.max(1, Math.floor(max / 8));
  if (pokemon.status === 'badly-poisoned') return Math.max(1, Math.floor(max * pokemon.poisonCount / 16));
  return 0;
}
