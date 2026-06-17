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
}

export interface TeamPokemon extends BasePokemon {
  selectedMoves: Move[];
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

export interface BattleLogEntry {
  id: number;
  text: string;
  type: 'move' | 'damage' | 'status' | 'faint' | 'switch' | 'effectiveness' | 'info';
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
