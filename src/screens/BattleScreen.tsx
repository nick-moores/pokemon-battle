import { useState, useEffect, useRef } from 'react';
import { useBattleStore } from '../store/battleStore';
import { battleMusic } from '../utils/battleMusic';
import { BattlePokemon, BattleTeam, Move, WeatherType } from '../types';
import { HPBar } from '../components/HPBar';
import { StatusBadge } from '../components/StatusBadge';
import { MoveButton } from '../components/MoveButton';
import { TypeBadge } from '../components/TypeBadge';
import { BattleLog, BattleTextBox } from '../components/BattleLog';
import { getDamageBreakdown, DamageBreakdown, getStagedStat } from '../utils/damage';

function PokemonSide({
  team,
  isTop,
  showBack,
  lunging = false,
  flashing = false,
}: {
  team: BattleTeam;
  isTop: boolean;
  showBack: boolean;
  lunging?: boolean;
  flashing?: boolean;
}) {
  const pokemon = team.pokemon[team.activeIndex];
  if (!pokemon) return null;
  const fainted = pokemon.isFainted;

  return (
    <div className={`flex ${isTop ? 'flex-row-reverse' : 'flex-row'} items-end gap-3`}>
      <div className={`relative ${lunging ? (isTop ? 'pokemon-lunge-down' : 'pokemon-lunge-up') : ''}`}>
        <img
          src={showBack ? pokemon.backSprite || pokemon.sprite : pokemon.sprite}
          alt={pokemon.displayName}
          className={`w-28 h-28 object-contain transition-opacity duration-300 ${fainted ? 'opacity-20 grayscale' : ''} ${flashing ? 'pokemon-flash' : ''}`}
          style={{ imageRendering: 'pixelated' }}
        />
        {fainted && (
          <div className="absolute inset-0 flex items-center justify-center text-red-400 font-bold text-xs">
            FAINTED
          </div>
        )}
      </div>
      <div className={`flex-1 ${isTop ? 'text-right' : 'text-left'}`}>
        <div className={`flex items-center gap-2 mb-1 ${isTop ? 'justify-end' : 'justify-start'}`}>
          <span className="font-bold text-white text-lg">{pokemon.displayName}</span>
          <StatusBadge status={pokemon.status} />
        </div>
        <div className={`flex gap-1 mb-1 ${isTop ? 'justify-end' : 'justify-start'}`}>
          {pokemon.types.map(t => <TypeBadge key={t} type={t} small />)}
        </div>
        {(() => {
          const stages = pokemon.stages ?? { attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 };
          const statKeys: [keyof typeof stages & keyof typeof pokemon.stats, string][] = [
            ['attack', 'ATK'], ['defense', 'DEF'], ['specialAttack', 'SpA'],
            ['specialDefense', 'SpD'], ['speed', 'SPD'],
          ];
          return (
            <div className={`flex gap-1 mb-2 ${isTop ? 'justify-end' : 'justify-start'}`}>
              {statKeys.map(([k, label]) => {
                const stage = stages[k] as number;
                const base = pokemon.stats[k] as number;
                const effective = getStagedStat(base, stage);
                const arrows = stage > 0 ? '▲'.repeat(Math.min(stage, 3)) : stage < 0 ? '▼'.repeat(Math.min(-stage, 3)) : '';
                return (
                  <div
                    key={k}
                    className={`flex flex-col items-center rounded px-1.5 py-0.5 min-w-[32px]
                      ${stage > 0 ? 'bg-green-700/60 ring-1 ring-green-500' : stage < 0 ? 'bg-red-800/60 ring-1 ring-red-500' : 'bg-gray-800'}`}
                  >
                    <span className={`text-[9px] font-bold leading-none ${stage > 0 ? 'text-green-300' : stage < 0 ? 'text-red-300' : 'text-gray-500'}`}>
                      {label}
                    </span>
                    <span className={`text-[11px] font-black leading-tight ${stage > 0 ? 'text-green-200' : stage < 0 ? 'text-red-200' : 'text-gray-300'}`}>
                      {effective}
                    </span>
                    {stage !== 0 && (
                      <span className={`text-[9px] leading-none ${stage > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {arrows || (stage > 0 ? `+${stage}` : `${stage}`)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
        <HPBar current={pokemon.currentHp} max={pokemon.stats.hp} showNumbers />
        <div className={`flex gap-1 mt-2 ${isTop ? 'justify-end' : 'justify-start'}`}>
          {team.pokemon.map((p, i) => (
            <div
              key={p.id}
              title={p.displayName}
              className={`w-3 h-3 rounded-full border ${
                i === team.activeIndex
                  ? 'bg-blue-400 border-blue-300'
                  : p.isFainted
                  ? 'bg-gray-700 border-gray-600'
                  : 'bg-green-400 border-green-300'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SwitchPanel({ team, onSwitch }: { team: BattleTeam; onSwitch: (i: number) => void }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4">
      <h3 className="font-bold text-white mb-3">{team.name} — Choose a Pokemon</h3>
      <div className="grid grid-cols-3 gap-2">
        {team.pokemon.map((p, i) => (
          <button
            key={p.id}
            onClick={() => !p.isFainted && i !== team.activeIndex && onSwitch(i)}
            disabled={p.isFainted || i === team.activeIndex}
            className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all
              ${p.isFainted ? 'opacity-30 border-gray-700 cursor-not-allowed'
                : i === team.activeIndex ? 'border-blue-400 bg-blue-900/30 cursor-not-allowed'
                : 'border-gray-600 hover:border-green-400 bg-gray-800 hover:bg-gray-700 cursor-pointer hover:scale-105'
              }`}
          >
            <img src={p.sprite} alt={p.displayName} className="w-12 h-12 object-contain" />
            <span className="text-xs text-white font-medium text-center mt-1 leading-tight">{p.displayName}</span>
            <div className="text-xs text-gray-400">{p.currentHp}/{p.stats.hp}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function pct(n: number, max: number) { return Math.round((n / max) * 100); }

function stageLabel(stage: number) {
  if (stage === 0) return <span className="text-gray-500">—</span>;
  return <span className={stage > 0 ? 'text-green-400' : 'text-red-400'}>{stage > 0 ? `+${stage}` : stage}</span>;
}

function DamageForecast({ breakdown, moveName }: { breakdown: DamageBreakdown; moveName: string }) {
  const { minDamage, maxDamage, critMax, defenderMaxHp, effectiveness } = breakdown;
  if (effectiveness === 0) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-xs text-gray-300 space-y-1">
        <div className="font-bold text-white">{moveName}</div>
        <div className="text-red-400 font-bold">Immune — no effect</div>
      </div>
    );
  }
  const minPct = pct(minDamage, defenderMaxHp);
  const maxPct = pct(maxDamage, defenderMaxHp);
  const critPct = pct(critMax, defenderMaxHp);
  const multParts: string[] = [];
  if (breakdown.isStab) multParts.push(`STAB ×${breakdown.stabMult.toFixed(1)}`);
  if (breakdown.effectiveness !== 1) {
    const eff = breakdown.effectiveness;
    const label = eff >= 4 ? '×4' : eff >= 2 ? '×2' : eff === 0.5 ? '×0.5' : '×0.25';
    multParts.push(`Type ${label}`);
  }
  if (breakdown.weatherMult !== 1) multParts.push(`Weather ×${breakdown.weatherMult}`);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-xs text-gray-300 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-bold text-white">{moveName}</span>
        <span className="text-gray-500">Pwr {breakdown.power} · {breakdown.category === 'special' ? 'Sp.' : 'Phys.'}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <div className="text-gray-400">
          {breakdown.category === 'special' ? 'Sp. Atk' : 'Attack'}
        </div>
        <div>
          {breakdown.atkStatRaw}
          {breakdown.atkStage !== 0 && <> × stage {stageLabel(breakdown.atkStage)}</>}
          {breakdown.atkStatEffective !== breakdown.atkStatRaw && (
            <span className="text-yellow-400"> = {breakdown.atkStatEffective}</span>
          )}
        </div>
        <div className="text-gray-400">
          {breakdown.category === 'special' ? 'Sp. Def' : 'Defense'}
        </div>
        <div>
          {breakdown.defStatRaw}
          {breakdown.defStage !== 0 && <> × stage {stageLabel(breakdown.defStage)}</>}
          {breakdown.defStatEffective !== breakdown.defStatRaw && (
            <span className="text-yellow-400"> = {breakdown.defStatEffective}</span>
          )}
        </div>
      </div>
      {multParts.length > 0 && (
        <div className="text-purple-300">{multParts.join(' · ')}</div>
      )}
      {breakdown.abilityNote && (
        <div className="text-blue-300">⚡ {breakdown.abilityNote}</div>
      )}
      <div className="border-t border-gray-700 pt-2 flex items-center justify-between">
        <div>
          <span className="text-white font-bold">{minDamage}–{maxDamage}</span>
          <span className="text-gray-400 ml-1">({minPct}–{maxPct}% HP)</span>
        </div>
        <div className="text-yellow-400 text-[10px]">
          Crit: {critMax} ({critPct}%)
        </div>
      </div>
    </div>
  );
}

function StatsAudit({ attacker, defender, weather }: { attacker: BattlePokemon; defender: BattlePokemon; weather: WeatherType | null }) {
  const rows: [string, keyof BattlePokemon['stats'], keyof BattlePokemon['stages']][] = [
    ['HP', 'hp', 'attack'], // stages n/a for HP, placeholder
    ['Attack', 'attack', 'attack'],
    ['Defense', 'defense', 'defense'],
    ['Sp. Atk', 'specialAttack', 'specialAttack'],
    ['Sp. Def', 'specialDefense', 'specialDefense'],
    ['Speed', 'speed', 'speed'],
  ];
  const cell = (p: BattlePokemon, stat: keyof BattlePokemon['stats'], stageKey: keyof BattlePokemon['stages']) => {
    const base = p.stats[stat];
    if (stat === 'hp') return (
      <td className="text-center px-2 py-1">
        <span className="text-white">{p.currentHp}</span>
        <span className="text-gray-500">/{base}</span>
      </td>
    );
    const stage = p.stages?.[stageKey] ?? 0;
    const effective = getStagedStat(base, stage);
    return (
      <td className="text-center px-2 py-1">
        <span className="text-white">{base}</span>
        {stage !== 0 && (
          <span className={`ml-1 text-[10px] font-bold ${stage > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stage > 0 ? `+${stage}` : stage}
          </span>
        )}
        {stage !== 0 && (
          <span className="text-yellow-400 ml-1">→{effective}</span>
        )}
      </td>
    );
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400">
            <th className="text-left px-2 py-1">Stat</th>
            <th className="text-center px-2 py-1 text-blue-300">{attacker.displayName}</th>
            <th className="text-center px-2 py-1 text-red-300">{defender.displayName}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {rows.map(([label, stat, stageKey]) => (
            <tr key={label}>
              <td className="text-gray-400 px-2 py-1">{label}</td>
              {cell(attacker, stat, stageKey)}
              {cell(defender, stat, stageKey)}
            </tr>
          ))}
          <tr>
            <td className="text-gray-400 px-2 py-1">Ability</td>
            <td className="text-center px-2 py-1 text-blue-300 capitalize">{attacker.ability?.replace(/-/g, ' ') || '—'}</td>
            <td className="text-center px-2 py-1 text-red-300 capitalize">{defender.ability?.replace(/-/g, ' ') || '—'}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-2 text-[10px] text-gray-600 text-center">Lv 50 · 31 IVs · 0 EVs · neutral nature</div>
    </div>
  );
}

interface BattleScreenProps {
  onEnd: () => void;
}

export function BattleScreen({ onEnd }: BattleScreenProps) {
  const { battle, selectMove, switchPokemon, clearBattle } = useBattleStore();
  const [muted, setMuted] = useState(false);
  const [hoveredMove, setHoveredMove] = useState<Move | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [anim, setAnim] = useState({ t1Lunge: false, t2Lunge: false, t1Flash: false, t2Flash: false });
  const prevLogLen = useRef(battle?.log.length ?? 0);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    battleMusic.play();
    return () => battleMusic.stop();
  }, []);

  useEffect(() => {
    if (battle?.phase === 'game-over') battleMusic.stop();
  }, [battle?.phase]);

  useEffect(() => {
    if (!battle) return;
    const newEntries = battle.log.slice(prevLogLen.current);
    prevLogLen.current = battle.log.length;
    if (!newEntries.length) return;

    const t1Name = battle.team1.pokemon[battle.team1.activeIndex]?.displayName ?? '';
    const t2Name = battle.team2.pokemon[battle.team2.activeIndex]?.displayName ?? '';

    let t1Lunge = false, t2Lunge = false, t1Flash = false, t2Flash = false;
    for (const entry of newEntries) {
      if (entry.type !== 'damage') continue;
      if (!entry.text.includes(' took ') || !entry.text.endsWith(' damage!')) continue;
      const hitName = entry.text.split(' took ')[0];
      if (hitName === t2Name) { t1Lunge = true; t2Flash = true; }
      if (hitName === t1Name) { t2Lunge = true; t1Flash = true; }
    }

    if (!t1Lunge && !t2Lunge && !t1Flash && !t2Flash) return;
    if (animTimer.current) clearTimeout(animTimer.current);
    setAnim({ t1Lunge, t2Lunge, t1Flash, t2Flash });
    animTimer.current = setTimeout(() => {
      setAnim({ t1Lunge: false, t2Lunge: false, t1Flash: false, t2Flash: false });
    }, 450);
  }, [battle?.log.length]);

  useEffect(() => () => { if (animTimer.current) clearTimeout(animTimer.current); }, []);

  const toggleMute = () => {
    setMuted(m => {
      if (m) battleMusic.play();
      else battleMusic.stop();
      return !m;
    });
  };

  if (!battle) return null;

  const { team1, team2, phase, turn, log, winner, weather, weatherTurnsLeft } = battle;
  const t1Active = team1.pokemon[team1.activeIndex];
  const t2Active = team2.pokemon[team2.activeIndex];

  const handleEnd = () => {
    clearBattle();
    onEnd();
  };

  if (phase === 'game-over') {
    const winnerName = winner === 'team1' ? team1.name : team2.name;
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-white">
        <div className="text-6xl mb-4">🏆</div>
        <h2 className="text-3xl font-extrabold mb-2">{winnerName} wins!</h2>
        <p className="text-gray-400 mb-2">Battle lasted {turn} turns</p>
        <div className="w-full max-w-md mb-6">
          <BattleLog entries={log} />
        </div>
        <button
          onClick={handleEnd}
          className="px-8 py-4 bg-red-600 hover:bg-red-500 rounded-2xl font-bold text-xl"
        >
          Back to Home
        </button>
      </div>
    );
  }

  const isTeam1Turn = phase === 'team1-move';
  const isTeam2Turn = phase === 'team2-move';
  const isSwitchTeam1 = phase === 'switch-team1';
  const isSwitchTeam2 = phase === 'switch-team2';

  const activeTeamName = isTeam1Turn ? team1.name
    : isTeam2Turn ? team2.name
    : isSwitchTeam1 ? team1.name
    : team2.name;

  const activePokemon = isTeam1Turn || isSwitchTeam1 ? t1Active : t2Active;
  const opponentPokemon = isTeam1Turn || isSwitchTeam1 ? t2Active : t1Active;
  const activeMoves = activePokemon?.selectedMoves ?? [];

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col text-white">
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Turn {turn}</span>
          {weather && (() => {
            const icons: Record<string, string> = { sunny: '☀️', rain: '🌧️', sandstorm: '🌪️', hail: '❄️' };
            const labels: Record<string, string> = { sunny: 'Sunny', rain: 'Rain', sandstorm: 'Sandstorm', hail: 'Hail' };
            const colors: Record<string, string> = {
              sunny: 'text-yellow-300 bg-yellow-900/50 ring-yellow-700',
              rain: 'text-blue-300 bg-blue-900/50 ring-blue-700',
              sandstorm: 'text-orange-300 bg-orange-900/50 ring-orange-700',
              hail: 'text-cyan-300 bg-cyan-900/50 ring-cyan-700',
            };
            return (
              <div className={`text-xs font-bold px-2 py-0.5 rounded-full ring-1 ${colors[weather]}`}>
                {icons[weather]} {labels[weather]} {weatherTurnsLeft}t
              </div>
            );
          })()}
        </div>
        <span className="font-bold text-blue-300">{team1.name} vs {team2.name}</span>
        <div className="flex items-center gap-3">
          <button onClick={toggleMute} className="text-lg" title={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">
        <PokemonSide team={team2} isTop={true} showBack={false} lunging={anim.t2Lunge} flashing={anim.t2Flash} />

        <div className="text-center py-1">
          <div className="inline-flex items-center gap-2 bg-gray-800 rounded-full px-4 py-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-bold text-gray-200">
              {isTeam1Turn
                ? `${team1.name}'s turn — pick a move`
                : isTeam2Turn
                ? `${team2.name}'s turn — pick a move`
                : isSwitchTeam1
                ? `${team1.name} — pick your next Pokemon`
                : `${team2.name} — pick your next Pokemon`}
            </span>
          </div>
        </div>

        <PokemonSide team={team1} isTop={false} showBack={true} lunging={anim.t1Lunge} flashing={anim.t1Flash} />

        <BattleTextBox entries={log} />

        {(isSwitchTeam1 || isSwitchTeam2) && (
          <SwitchPanel
            team={isSwitchTeam1 ? team1 : team2}
            onSwitch={(i) => switchPokemon(isSwitchTeam1 ? 1 : 2, i)}
          />
        )}

        {(isTeam1Turn || isTeam2Turn) && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              {activeTeamName}'s {activePokemon?.displayName} — {activePokemon?.chargingMove ? 'Charging...' : 'Choose a move'}
            </div>

            {activePokemon?.chargingMove ? (
              <div className="bg-gray-800 rounded-2xl p-4 text-center">
                <div className="text-2xl mb-2">
                  {activePokemon.chargingMove.name === 'dig' || activePokemon.chargingMove.name === 'dive' ? '🕳️'
                    : activePokemon.chargingMove.name === 'fly' || activePokemon.chargingMove.name === 'bounce' ? '🌤️'
                    : activePokemon.chargingMove.name === 'solar-beam' || activePokemon.chargingMove.name === 'meteor-beam' ? '✨'
                    : activePokemon.chargingMove.name === 'phantom-force' || activePokemon.chargingMove.name === 'shadow-force' ? '👻'
                    : '⚡'}
                </div>
                <div className="text-white font-bold mb-1">{activePokemon.displayName} is charging {activePokemon.chargingMove.displayName}!</div>
                <div className="text-gray-400 text-xs mb-3">The move will strike next turn.</div>
                <button
                  onClick={() => selectMove(isTeam1Turn ? 1 : 2, activePokemon.chargingMove!)}
                  className="px-6 py-2 bg-blue-700 hover:bg-blue-600 rounded-xl font-bold text-sm text-white"
                >
                  Continue →
                </button>
              </div>
            ) : activeMoves.length === 0 ? (
              <div className="bg-gray-800 rounded-2xl p-4 text-center text-gray-500">
                <div className="mb-2">No moves assigned!</div>
                <button
                  onClick={() => selectMove(isTeam1Turn ? 1 : 2, {
                    id: -1, name: 'struggle', displayName: 'Struggle',
                    type: 'normal', power: 50, pp: 10, damageClass: 'physical', category: '',
                    effectEntry: 'Deals recoil damage.', ailment: 'none', ailmentChance: 0, statChanges: [],
                  })}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-xl font-bold text-sm"
                >
                  Use Struggle
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {activeMoves.map(move => (
                    <div
                      key={move.id}
                      onMouseEnter={() => setHoveredMove(move)}
                      onMouseLeave={() => setHoveredMove(null)}
                    >
                      <MoveButton
                        move={move}
                        defenderTypes={opponentPokemon?.types}
                        onClick={() => selectMove(isTeam1Turn ? 1 : 2, move)}
                      />
                    </div>
                  ))}
                </div>
                {hoveredMove && activePokemon && opponentPokemon && (() => {
                  const bd = getDamageBreakdown(activePokemon, opponentPokemon, hoveredMove, weather);
                  return bd ? <DamageForecast breakdown={bd} moveName={hoveredMove.displayName} /> : null;
                })()}
              </>
            )}

            {activePokemon && opponentPokemon && (
              <div>
                <button
                  onClick={() => setShowStats(s => !s)}
                  className="w-full text-xs text-gray-500 hover:text-gray-300 py-1 flex items-center justify-center gap-1"
                >
                  <span>{showStats ? '▲' : '▼'}</span>
                  {showStats ? 'Hide stats' : '📊 Show stats & audit'}
                </button>
                {showStats && (
                  <StatsAudit attacker={activePokemon} defender={opponentPokemon} weather={weather} />
                )}
              </div>
            )}

            <div className="flex gap-2 mt-2">
              {(() => {
                const activeTeam = isTeam1Turn ? team1 : team2;
                const canSwitch = activeTeam.pokemon.some((p, i) => i !== activeTeam.activeIndex && !p.isFainted);
                return (
                  <button
                    onClick={() => {
                      const switchPhase = isTeam1Turn ? 'switch-team1' : 'switch-team2';
                      useBattleStore.setState(s => ({
                        battle: s.battle ? { ...s.battle, phase: switchPhase as any } : null
                      }));
                    }}
                    disabled={!canSwitch}
                    className="flex-1 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold"
                    title={!canSwitch ? 'No other Pokémon available' : undefined}
                  >
                    Switch Pokemon
                  </button>
                );
              })()}
              <button
                onClick={() => {
                  if (confirm(`${activeTeamName} forfeit? This will end the battle.`)) {
                    useBattleStore.setState(s => {
                      if (!s.battle) return s;
                      const winner = isTeam1Turn ? 'team2' : 'team1';
                      const winnerName = winner === 'team1' ? s.battle.team1.name : s.battle.team2.name;
                      return {
                        battle: {
                          ...s.battle,
                          phase: 'game-over',
                          winner,
                          log: [...s.battle.log, { id: Date.now(), text: `${activeTeamName} forfeited! ${winnerName} wins!`, type: 'info' }],
                        },
                      };
                    });
                  }
                }}
                className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-red-900 text-sm font-bold text-gray-400 hover:text-red-400"
              >
                Forfeit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
