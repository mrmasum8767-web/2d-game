import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHUD } from './components/GameHUD';
import { GameOverlays } from './components/GameOverlays';
import { SolarisEngine } from './game/engine';
import { GAME_CONSTANTS, GameHudSnapshot, SECTORS } from './game/types';

const INITIAL_HUD: GameHudSnapshot = {
  phase: 'title',
  score: 0,
  bestScore: 0,
  distance: 0,
  hull: GAME_CONSTANTS.MAX_HULL,
  maxHull: GAME_CONSTANTS.MAX_HULL,
  shieldCharge: 0,
  boostEnergy: 100,
  isBoosting: false,
  combo: 1,
  maxCombo: 1,
  ringsCleared: 0,
  dronesShattered: 0,
  crystalsCollected: 0,
  speedKmh: 0,
  sectorIndex: SECTORS[0].index,
  sectorName: SECTORS[0].name,
  isNewBest: false,
  muted: false,
  cannonCooldownRatio: 0,
  mouseSteer: false,
  invertY: false,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SolarisEngine | null>(null);
  const [hud, setHud] = useState<GameHudSnapshot>(INITIAL_HUD);
  const [showTouchControls, setShowTouchControls] = useState(true);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new SolarisEngine(mount, (snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleStart = useCallback(() => {
    engineRef.current?.startGame();
  }, []);

  const handlePause = useCallback(() => {
    engineRef.current?.pauseGame();
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.resumeGame();
  }, []);

  const handleReturnTitle = useCallback(() => {
    engineRef.current?.returnToTitle();
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  const handleToggleTouchControls = useCallback(() => {
    setShowTouchControls((prev) => {
      if (prev) {
        engineRef.current?.setVirtualSteer(0, 0);
        engineRef.current?.setVirtualBoost(false);
        engineRef.current?.setVirtualFire(false);
      }
      return !prev;
    });
  }, []);

  const handleVirtualSteer = useCallback((x: number, y: number) => {
    engineRef.current?.setVirtualSteer(x, y);
  }, []);

  const handleVirtualBoost = useCallback((active: boolean) => {
    engineRef.current?.setVirtualBoost(active);
  }, []);

  const handleVirtualFire = useCallback((active: boolean) => {
    engineRef.current?.setVirtualFire(active);
  }, []);

  const handleToggleMouseSteer = useCallback(() => {
    engineRef.current?.toggleMouseSteer();
  }, []);

  const handleToggleInvertY = useCallback(() => {
    engineRef.current?.toggleInvertY();
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#120e12]">
      {/* Isolated WebGL mount container — never unmounted by React HUD updates */}
      <div ref={canvasMountRef} className="h-full w-full" />

      <GameHUD
        hud={hud}
        showTouchControls={showTouchControls}
        onToggleTouchControls={handleToggleTouchControls}
        onToggleMute={handleToggleMute}
        onPause={handlePause}
        onVirtualSteer={handleVirtualSteer}
        onVirtualBoost={handleVirtualBoost}
        onVirtualFire={handleVirtualFire}
      />

      <GameOverlays
        hud={hud}
        onStart={handleStart}
        onResume={handleResume}
        onReturnTitle={handleReturnTitle}
        onToggleMute={handleToggleMute}
        onToggleMouseSteer={handleToggleMouseSteer}
        onToggleInvertY={handleToggleInvertY}
      />
    </main>
  );
}
