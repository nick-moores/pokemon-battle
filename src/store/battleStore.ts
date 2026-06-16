import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  BattleState, BattleTeam, BattlePokemon, Move, Team,
  StatusCondition, BattleRecord, BattleLogEntry
} from '../types';
import { calculateDamage, getStatusTickDamage, getStagedSpeed, ZERO_STAGES } from '../utils/damage';
import { Stages } from '../types';
import { getEffectivenessText } from '../data/typeChart';

let logId = 0;
function log(text: string, type: BattleLogEntry['type'] = 'info'): BattleLogEntry {
  return { id: logId++, text, type };
}

function initBattlePokemon(p: Team['pokemon'][0]): BattlePokemon {
  return {
    ...p,
    currentHp: p.stats.hp,
    status: 'none',
    confusionTurns: 0,
    sleepTurns: 0,
    poisonCount: 1,
    isFainted: false,
    stages: { ...ZERO_STAGES },
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

function executeMove(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  attackerName: string,
  logs: BattleLogEntry[]
): { atk: BattlePokemon; def: BattlePokemon } {
  logs.push(log(`${attackerName} used ${move.displayName}!`, 'move'));

  let atk = attacker;
  let def = defender;

  if (move.damageClass === 'status') {
    const statChanges = move.statChanges ?? [];
    const selfChanges = statChanges.filter(sc => sc.target === 'user');
    const oppChanges = statChanges.filter(sc => sc.target === 'opponent');

    const ailment = move.ailment;
    if (ailment === 'burn' || ailment === 'poison' || ailment === 'paralysis' || ailment === 'sleep' || ailment === 'freeze' || ailment === 'badly-poisoned') {
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
    } else if (ailment === 'confusion') {
      if (def.status === 'none' || def.status === 'confusion') {
        logs.push(log(`${def.displayName} became confused!`, 'status'));
        def = { ...def, status: 'confusion', confusionTurns: Math.floor(Math.random() * 3) + 2 };
      }
    }

    if (selfChanges.length) atk = applyStatChanges(atk, selfChanges, logs);
    if (oppChanges.length) def = applyStatChanges(def, oppChanges, logs);
    return { atk, def };
  }

  const { damage, effectiveness, isCrit } = calculateDamage(atk, def, move);

  if (effectiveness === 0) {
    logs.push(log(`It doesn't affect ${def.displayName}...`, 'effectiveness'));
    return { atk, def };
  }

  const effectText = getEffectivenessText(effectiveness);
  if (effectText) logs.push(log(effectText, 'effectiveness'));
  if (isCrit) logs.push(log('A critical hit!', 'info'));

  def = applyDamage(def, damage);
  logs.push(log(`${def.displayName} took ${damage} damage!`, 'damage'));
  if (def.isFainted) logs.push(log(`${def.displayName} fainted!`, 'faint'));

  if (!def.isFainted && move.ailmentChance > 0 && Math.random() * 100 < move.ailmentChance) {
    const ailment = move.ailment as StatusCondition;
    const withStatus = applyStatus(def, ailment);
    if (withStatus.status !== def.status) {
      logs.push(log(`${def.displayName} was afflicted with ${ailment}!`, 'status'));
      def = ailment === 'sleep' ? { ...withStatus, sleepTurns: Math.floor(Math.random() * 3) + 1 } : withStatus;
    }
  }

  // Self stat changes from damage moves (Close Combat, Draco Meteor, etc.)
  const selfStatChanges = (move.statChanges ?? []).filter(sc => sc.target === 'user');
  if (selfStatChanges.length && !def.isFainted) atk = applyStatChanges(atk, selfStatChanges, logs);

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
        set({
          battle: {
            team1: initBattleTeam(team1),
            team2: initBattleTeam(team2),
            phase: 'team1-move',
            turn: 1,
            team1SelectedMove: null,
            team2SelectedMove: null,
            log: [log(`Battle start! ${team1.name} vs ${team2.name}!`, 'info')],
            winner: null,
          },
        });
      },

      selectMove: (teamNum, move) => {
        const { battle } = get();
        if (!battle) return;

        if (teamNum === 1) {
          if (battle.phase !== 'team1-move') return;
          set({ battle: { ...battle, team1SelectedMove: move, phase: 'team2-move' } });
          return;
        }

        if (battle.phase !== 'team2-move') return;
        const t1Move = battle.team1SelectedMove!;
        const t2Move = move;

        let t1 = { ...battle.team1 };
        let t2 = { ...battle.team2 };
        const logs: BattleLogEntry[] = [];

        const t1Active = t1.pokemon[t1.activeIndex];
        const t2Active = t2.pokemon[t2.activeIndex];

        const t1Speed = getStagedSpeed(t1Active);
        const t2Speed = getStagedSpeed(t2Active);
        const t1First = t1Speed > t2Speed || (t1Speed === t2Speed && Math.random() < 0.5);

        const executeTurn = (
          atk: BattleTeam, def: BattleTeam, atkMove: Move, isT1: boolean
        ): { atk: BattleTeam; def: BattleTeam } => {
          const atkIdx = atk.activeIndex;
          const defIdx = def.activeIndex;

          let atkPokemon = atk.pokemon[atkIdx];
          if (atkPokemon.isFainted) return { atk, def };

          const { pokemon: resolved, canMove } = resolveStatusEffect(atkPokemon, logs);
          atkPokemon = resolved;
          const updatedAtkPokemon = [...atk.pokemon];
          updatedAtkPokemon[atkIdx] = atkPokemon;
          atk = { ...atk, pokemon: updatedAtkPokemon };

          if (!canMove || atkPokemon.isFainted) return { atk, def };

          const defPokemon = def.pokemon[defIdx];
          const result = executeMove(atkPokemon, defPokemon, atkMove, `${isT1 ? t1.name : t2.name}'s ${atkPokemon.displayName}`, logs);
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
              ...battle, t1, t2,
              team1: t1, team2: t2,
              phase: 'game-over',
              turn: battle.turn + 1,
              team1SelectedMove: null,
              team2SelectedMove: null,
              log: [...battle.log, ...logs],
              winner,
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
          },
        });
      },

      switchPokemon: (teamNum, pokemonIndex) => {
        const { battle } = get();
        if (!battle) return;
        const logs: BattleLogEntry[] = [];

        if (teamNum === 1) {
          const newPokemon = battle.team1.pokemon[pokemonIndex];
          logs.push(log(`${battle.team1.name} sent out ${newPokemon.displayName}!`, 'switch'));
          const resetPokemon = battle.team1.pokemon.map((p, i) =>
            i === pokemonIndex ? { ...p, stages: { ...ZERO_STAGES } } : p
          );
          const t1 = { ...battle.team1, activeIndex: pokemonIndex, pokemon: resetPokemon };
          const t2 = battle.team2;
          const t2Fainted = t2.pokemon[t2.activeIndex].isFainted;
          const phase: BattleState['phase'] = (battle.phase === 'switch-team1' && t2Fainted) ? 'switch-team2' : 'team1-move';
          set({ battle: { ...battle, team1: t1, phase, log: [...battle.log, ...logs] } });
        } else {
          const newPokemon = battle.team2.pokemon[pokemonIndex];
          logs.push(log(`${battle.team2.name} sent out ${newPokemon.displayName}!`, 'switch'));
          const resetPokemon = battle.team2.pokemon.map((p, i) =>
            i === pokemonIndex ? { ...p, stages: { ...ZERO_STAGES } } : p
          );
          const t2 = { ...battle.team2, activeIndex: pokemonIndex, pokemon: resetPokemon };
          set({ battle: { ...battle, team2: t2, phase: 'team1-move', log: [...battle.log, ...logs] } });
        }
      },

      clearBattle: () => set({ battle: null }),
    }),
    { name: 'pokemon-battle-state', partialize: (s) => ({ history: s.history }) }
  )
);
