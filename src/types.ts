export interface PokemonStats {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export interface StatChange {
  stat: 'attack' | 'defense' | 'specialAttack' | 'specialDefense' | 'speed' | 'accuracy' | 'evasion';
  change: number;
  target: 'user' | 'opponent';
}

export interface Move {
  id: number;
  name: string;
  displayName: string;
  type: string;
  power: number | null;
  accuracy: number | null;  // null = always hits (Swift, Aerial Ace, etc.)
  critRate: number;         // PokeAPI crit_rate stage: 0=6.25%, 1=12.5%, 2=50%, 3+=100%
  pp: number;
  damageClass: 'physical' | 'special' | 'status';
  category: string;
  effectEntry: string;
  ailment: string;
  ailmentChance: number;
  statChanges: StatChange[];
}

export interface Stages {
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  accuracy: number;
  evasion: number;
}

export interface BasePokemon {
  id: number;
  name: string;
  displayName: string;
  sprite: string;
  backSprite: string;
  types: string[];
  stats: PokemonStats;
  availableMoveNames: string[];
  availableAbilities: string[];
}

export interface TeamPokemon extends BasePokemon {
  selectedMoves: Move[];
  ability: string;
}

export interface Team {
  id: string;
  name: string;
  pokemon: TeamPokemon[];
}

export type WeatherType = 'sunny' | 'rain' | 'sandstorm' | 'hail';

export type StatusCondition =
  | 'none'
  | 'burn'
  | 'poison'
  | 'badly-poisoned'
  | 'paralysis'
  | 'sleep'
  | 'freeze'
  | 'confusion';

export interface BattlePokemon extends TeamPokemon {
  currentHp: number;
  status: StatusCondition;
  confusionTurns: number;
  sleepTurns: number;
  poisonCount: number;
  isFainted: boolean;
  stages: Stages;
  flashFireActive: boolean;
  chargingMove: Move | null;
  isInvulnerable: boolean;
  currentPP: number[];  // parallel to selectedMoves
  substituteHp: number | null;  // null = no sub; number = sub's remaining HP
}

export interface BattleTeam {
  teamId: string;
  name: string;
  pokemon: BattlePokemon[];
  activeIndex: number;
}

export type TurnPhase =
  | 'team1-move'
  | 'team2-move'
  | 'switch-team1'
  | 'switch-team2'
  | 'game-over';

export interface DamageCalcRecord {
  moveName: string;
  attackerName: string;
  power: number;
  category: string;
  atkStat: number;       // effective (after stage + ability)
  defStat: number;       // effective (after stage + ability)
  atkStage: number;
  defStage: number;
  stabMult: number;
  effectiveness: number;
  weatherMult: number;
  abilityMult: number;   // combined ability multiplier on damage
  abilityNote: string;
  isCrit: boolean;
  randomFactor: number;  // 0.85–1.00
  finalDamage: number;
  defenderMaxHp: number;
}

export interface BattleLogEntry {
  id: number;
  text: string;
  type: 'move' | 'damage' | 'status' | 'faint' | 'switch' | 'effectiveness' | 'info';
  damageCalc?: DamageCalcRecord;
}

export interface BattleState {
  team1: BattleTeam;
  team2: BattleTeam;
  phase: TurnPhase;
  turn: number;
  team1SelectedMove: Move | null;
  team2SelectedMove: Move | null;
  log: BattleLogEntry[];
  winner: 'team1' | 'team2' | null;
  weather: WeatherType | null;
  weatherTurnsLeft: number;
}

export interface BattleRecord {
  id: string;
  date: string;
  team1Name: string;
  team2Name: string;
  winner: string;
  turns: number;
}
