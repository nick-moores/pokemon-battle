import { useState } from 'react';
import { useTeamStore } from './store/teamStore';
import { useBattleStore } from './store/battleStore';
import { HomeScreen } from './screens/HomeScreen';
import { TeamBuilderScreen } from './screens/TeamBuilderScreen';
import { BattleSetupScreen } from './screens/BattleSetupScreen';
import { BattleScreen } from './screens/BattleScreen';
import { HistoryScreen } from './screens/HistoryScreen';

type Screen = 'home' | 'teams' | 'battle-setup' | 'battle' | 'history';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const { teams } = useTeamStore();
  const { battle } = useBattleStore();

  if (battle && screen !== 'battle') {
    setScreen('battle');
  }

  return (
    <div className="font-sans">
      {screen === 'home' && (
        <HomeScreen
          teamCount={teams.length}
          onGoTeams={() => setScreen('teams')}
          onGoBattle={() => setScreen('battle-setup')}
          onGoHistory={() => setScreen('history')}
        />
      )}
      {screen === 'teams' && (
        <TeamBuilderScreen onBack={() => setScreen('home')} />
      )}
      {screen === 'battle-setup' && (
        <BattleSetupScreen
          onBack={() => setScreen('home')}
          onBattleStart={() => setScreen('battle')}
        />
      )}
      {screen === 'battle' && (
        <BattleScreen onEnd={() => setScreen('home')} />
      )}
      {screen === 'history' && (
        <HistoryScreen onBack={() => setScreen('home')} />
      )}
    </div>
  );
}
