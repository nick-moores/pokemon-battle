import React from 'react';

const px8 = "'Press Start 2P', monospace";

function PixelPokeball() {
  const S = 5; // pixel size
  // 16×16 grid: R=red, W=white, K=black, O=button-white, .=transparent
  const grid = [
    '....RRRRRRRR....',
    '..RRRRRRRRRRRR..',
    '.RRRRRRRRRRRRRR.',
    'RRRRRRRRRRRRRRRR',
    'RRRRRRRRRRRRRRRR',
    'RRRRRRRRRRRRRRRR',
    'RRRRKKKKKKKRRRRR',
    'KKKKKOOOOOKKKKKKK',
    'KKKKKOOOOKKKKKKK',
    'WWWWKKKKKKKWWWWW',
    'WWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWW',
    '.WWWWWWWWWWWWWW.',
    '.WWWWWWWWWWWWWW.',
    '..WWWWWWWWWWWW..',
    '....WWWWWWWW....',
  ];
  const colors: Record<string, string> = { R: '#E3350D', W: '#F0F0F0', K: '#1a1a1a', O: '#ffffff' };
  const rects: React.ReactElement[] = [];
  grid.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '.') return;
      rects.push(
        <rect key={`${x}-${y}`} x={x * S} y={y * S} width={S} height={S} fill={colors[c]} />
      );
    });
  });
  return (
    <svg width={16 * S} height={16 * S} style={{ imageRendering: 'pixelated', display: 'block', margin: '0 auto' }}>
      {rects}
    </svg>
  );
}

interface HomeScreenProps {
  onGoTeams: () => void;
  onGoBattle: () => void;
  onGoHistory: () => void;
  teamCount: number;
}

export function HomeScreen({ onGoTeams, onGoBattle, onGoHistory, teamCount }: HomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 p-6 text-white">
      <div className="text-center mb-10">
        <PixelPokeball />

        <div style={{ marginTop: '1.5rem', fontFamily: px8, lineHeight: 1.6 }}>
          <div style={{
            color: '#FFCB05',
            fontSize: 'clamp(1.1rem, 5vw, 1.75rem)',
            textShadow: [
              '-3px -3px 0 #3B4CCA', '3px -3px 0 #3B4CCA',
              '-3px  3px 0 #3B4CCA', '3px  3px 0 #3B4CCA',
              ' 0px -3px 0 #3B4CCA', '0px  3px 0 #3B4CCA',
              '-3px  0px 0 #3B4CCA', '3px  0px 0 #3B4CCA',
            ].join(', '),
            letterSpacing: '0.04em',
          }}>
            POKÉMON
          </div>
          <div style={{
            color: '#ffffff',
            fontSize: 'clamp(0.55rem, 2.5vw, 0.85rem)',
            marginTop: '0.6rem',
            textShadow: [
              '-2px -2px 0 #1a1a2e', '2px -2px 0 #1a1a2e',
              '-2px  2px 0 #1a1a2e', '2px  2px 0 #1a1a2e',
            ].join(', '),
            letterSpacing: '0.06em',
          }}>
            FAMILY BATTLE
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={onGoBattle}
          disabled={teamCount < 2}
          className="w-full py-5 rounded-2xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-900"
        >
          ⚔️ Start Battle
          {teamCount < 2 && <div className="text-sm font-normal opacity-70 mt-1">Build 2 teams first</div>}
        </button>

        <button
          onClick={onGoTeams}
          className="w-full py-5 rounded-2xl bg-blue-700 hover:bg-blue-600 font-bold text-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-900"
        >
          🏆 Manage Teams
          <div className="text-sm font-normal opacity-70 mt-1">{teamCount} team{teamCount !== 1 ? 's' : ''} saved</div>
        </button>

        <button
          onClick={onGoHistory}
          className="w-full py-4 rounded-2xl bg-gray-800 hover:bg-gray-700 font-bold text-lg transition-all hover:scale-105 active:scale-95"
        >
          📜 Battle History
        </button>
      </div>

      <p className="mt-12 text-gray-600 text-sm">All data saved locally in your browser</p>
      <p className="mt-2 text-gray-700 text-xs">Built by Nick, Danny, Bobby, Gloria, and Claude</p>
    </div>
  );
}
