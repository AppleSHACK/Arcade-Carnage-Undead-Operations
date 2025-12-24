
import React, { useState, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import MainMenu from './components/MainMenu';
import PauseMenu from './components/PauseMenu';

export type GameState = 'MENU' | 'PLAYING' | 'SETTINGS' | 'CREDITS' | 'PAUSED';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>('MENU');

  // Handle global Escape key for pausing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setGameState((prev) => {
          if (prev === 'PLAYING') return 'PAUSED';
          if (prev === 'PAUSED') return 'PLAYING';
          return prev;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isGameLogicPaused = gameState !== 'PLAYING';

  return (
    <div className="w-screen h-screen overflow-hidden bg-black relative">
      {/* The 3D Game Engine runs in the background */}
      <div className={`transition-all duration-1000 ${gameState !== 'PLAYING' ? 'blur-sm brightness-50 scale-105' : 'blur-0 brightness-100 scale-100'}`}>
        <GameCanvas isPaused={isGameLogicPaused} />
      </div>

      {/* Pause Overlay */}
      {gameState === 'PAUSED' && (
        <PauseMenu 
          onResume={() => setGameState('PLAYING')} 
          onAbort={() => setGameState('MENU')} 
        />
      )}

      {/* Main Menu Overlay */}
      {(gameState === 'MENU' || gameState === 'SETTINGS' || gameState === 'CREDITS') && (
        <div className="absolute inset-0 z-50">
          <MainMenu 
            onStart={() => setGameState('PLAYING')} 
            onOpenSettings={() => setGameState('SETTINGS')}
            onOpenCredits={() => setGameState('CREDITS')}
            currentView={gameState as 'MENU' | 'SETTINGS' | 'CREDITS'}
            onBack={() => setGameState('MENU')}
          />
        </div>
      )}
    </div>
  );
};

export default App;
