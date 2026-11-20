import React from 'react';
import { GameHudSnapshot } from '../game/types';

interface GameOverlaysProps {
  hud: GameHudSnapshot;
  onStart: () => void;
  onResume: () => void;
  onReturnTitle: () => void;
  onToggleMute: () => void;
  onToggleMouseSteer: () => void;
  onToggleInvertY: () => void;
}

export const GameOverlays: React.FC<GameOverlaysProps> = ({
  hud,
  onStart,
  onResume,
  onReturnTitle,
  onToggleMute,
  onToggleMouseSteer,
  onToggleInvertY,
}) => {
  if (hud.phase === 'playing') return null;

  if (hud.phase === 'title') {
    return (
      <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-6 sm:p-10">
        {/* Top Row: Bespoke inline SVG Title Lockup in calm upper sky negative space */}
        <div className="flex items-start justify-between gap-4">
          <div className="pointer-events-auto max-w-lg">
            <svg
              viewBox="0 0 460 112"
              className="w-[290px] sm:w-[410px] drop-shadow-[0_6px_18px_rgba(18,10,8,0.65)]"
              role="img"
              aria-label="Solaris Drift"
            >
              <defs>
                <linearGradient id="solarisGold" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fff7ed" />
                  <stop offset="50%" stopColor="#fdba74" />
                  <stop offset="100%" stopColor="#f97316" />
                </linearGradient>
                <linearGradient id="solarisTeal" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#2dd4bf" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
              </defs>
              {/* Wing Crest Accent */}
              <polygon points="8,24 44,18 32,34 6,32" fill="#f97316" />
              <polygon points="10,38 56,34 40,46 8,44" fill="#2dd4bf" />
              {/* Primary Title */}
              <text
                x="66"
                y="54"
                fill="url(#solarisGold)"
                fontSize="48"
                fontWeight="900"
                letterSpacing="4"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                SOLARIS
              </text>
              {/* Subtitle Lockup */}
              <rect x="68" y="66" width="138" height="3" rx="1.5" fill="url(#solarisTeal)" />
              <text
                x="216"
                y="76"
                fill="#fff7ed"
                fontSize="24"
                fontWeight="700"
                letterSpacing="9"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                DRIFT
              </text>
              <text
                x="68"
                y="98"
                fill="#e7d5c8"
                fontSize="12"
                fontWeight="600"
                letterSpacing="3.4"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                3D CANYON INTERCEPTOR
              </text>
            </svg>
          </div>

          <div className="pointer-events-auto flex items-center gap-2.5">
            {hud.bestScore > 0 && (
              <div className="rounded-xl border border-[#f59e0b]/30 bg-[#120e12]/82 px-3.5 py-2 text-right shadow-lg">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#fbbf24]">
                  Best Run
                </div>
                <div className="text-base font-bold text-[#fff7ed] tabular-nums">
                  {hud.bestScore.toLocaleString()}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={hud.muted ? 'Unmute Audio' : 'Mute Audio'}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#f59e0b]/30 bg-[#120e12]/82 text-[#fff7ed] transition-colors hover:border-[#2dd4bf] hover:text-[#5eead4] cursor-pointer"
            >
              {hud.muted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M11 5L6 9H2V15H6L11 19V5Z" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M11 5L6 9H2V15H6L11 19V5Z" />
                  <path d="M15.5 8.5C16.8 9.8 16.8 14.2 15.5 15.5" strokeLinecap="round" />
                  <path d="M18.5 5.5C21.2 8.2 21.2 15.8 18.5 18.5" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Bottom Row: Primary Start CTA + Single Flat Control Hint Line */}
        <div className="pointer-events-auto flex flex-col items-start sm:items-center gap-3 self-stretch">
          <button
            type="button"
            onClick={onStart}
            className="group flex items-center gap-3 rounded-xl border border-[#fdba74]/50 bg-[#f97316] px-8 py-3.5 text-base font-extrabold uppercase tracking-[0.14em] text-[#140c08] shadow-[0_10px_28px_rgba(249,115,22,0.42)] transition-transform duration-150 hover:scale-[1.03] hover:bg-[#fb923c] active:scale-[0.98] cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="5,3 20,12 5,21" />
            </svg>
            Launch Flight
          </button>

          <p className="rounded-lg border border-white/10 bg-[#120e12]/80 px-4 py-1.5 text-xs font-medium tracking-wide text-[#e7d5c8]">
            WASD / Arrows / Touch Stick Steer · Space Boost · Click / F Fire · Esc Pause
          </p>
        </div>
      </div>
    );
  }

  if (hud.phase === 'paused') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#120e12]/65 p-4">
        <div className="w-full max-w-md rounded-2xl border border-[#f59e0b]/35 bg-[#181216] p-6 shadow-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#2dd4bf]">
            Flight Paused & Controls
          </div>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#fff7ed]">
            Sector {hud.sectorIndex} · {hud.sectorName}
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-[#120e12] p-3.5 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#a8988e]">Score</div>
              <div className="text-lg font-bold text-[#fff7ed] tabular-nums">
                {hud.score.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#a8988e]">Distance</div>
              <div className="text-lg font-bold text-[#fff7ed] tabular-nums">
                {hud.distance.toLocaleString()} m
              </div>
            </div>
          </div>

          {/* Flight Control Toggles & Keybind Guide */}
          <div className="mt-4 space-y-2.5 rounded-xl border border-white/10 bg-[#120e12] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#e7d5c8]">
                Mouse Cursor Steering
              </span>
              <button
                type="button"
                onClick={onToggleMouseSteer}
                className={`rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  hud.mouseSteer
                    ? 'bg-[#2dd4bf] text-[#101818]'
                    : 'bg-[#261f24] text-[#b8a99e] hover:text-[#fff7ed]'
                }`}
              >
                {hud.mouseSteer ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#e7d5c8]">
                Invert Vertical Axis
              </span>
              <button
                type="button"
                onClick={onToggleInvertY}
                className={`rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  hud.invertY
                    ? 'bg-[#f97316] text-[#140c08]'
                    : 'bg-[#261f24] text-[#b8a99e] hover:text-[#fff7ed]'
                }`}
              >
                {hud.invertY ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="border-t border-white/10 pt-2.5 text-[11px] leading-relaxed text-[#b8a99e]">
              <div className="flex justify-between">
                <span>Steer / Climb / Dive</span>
                <span className="font-semibold text-[#fff7ed]">WASD · Arrows · Gimbal Pad</span>
              </div>
              <div className="flex justify-between">
                <span>Solar Boost (Ram Shield)</span>
                <span className="font-semibold text-[#5eead4]">Space · Boost Button</span>
              </div>
              <div className="flex justify-between">
                <span>Twin Plasma Cannon</span>
                <span className="font-semibold text-[#fdba74]">Click · F / J · Fire Button</span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full rounded-xl bg-[#f97316] py-3 text-sm font-extrabold uppercase tracking-[0.14em] text-[#140c08] transition-colors hover:bg-[#fb923c] cursor-pointer"
            >
              Resume Flight
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onStart}
                className="rounded-xl border border-white/15 bg-[#231b20] py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-[#f5ebe0] transition-colors hover:border-[#2dd4bf] cursor-pointer"
              >
                Restart Run
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="rounded-xl border border-white/15 bg-[#231b20] py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-[#b8a99e] transition-colors hover:text-[#fff7ed] cursor-pointer"
              >
                Title Screen
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Game Over Summary Modal
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#120e12]/72 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#f97316]/40 bg-[#181216] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#fb7185]">
            Hull Critical · Flight Terminated
          </span>
          {hud.isNewBest && (
            <span className="rounded-md bg-[#fbbf24] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#140c08]">
              New Record
            </span>
          )}
        </div>

        <div className="mt-2 flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-[#a8988e]">Final Score</div>
            <div className="text-4xl font-black tracking-tight text-[#fff7ed] tabular-nums">
              {hud.score.toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-[#a8988e]">Best</div>
            <div className="text-xl font-bold text-[#fbbf24] tabular-nums">
              {hud.bestScore.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-[#120e12] p-4 text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#a8988e]">Distance</div>
            <div className="text-base font-bold text-[#fff7ed] tabular-nums">
              {hud.distance.toLocaleString()} m
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#a8988e]">Max Combo</div>
            <div className="text-base font-bold text-[#5eead4] tabular-nums">×{hud.maxCombo}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#a8988e]">Solar Rings</div>
            <div className="text-base font-bold text-[#fff7ed] tabular-nums">{hud.ringsCleared}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#a8988e]">Drones Shattered</div>
            <div className="text-base font-bold text-[#fff7ed] tabular-nums">{hud.dronesShattered}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={onStart}
            className="flex-1 rounded-xl bg-[#f97316] py-3 text-sm font-extrabold uppercase tracking-[0.14em] text-[#140c08] transition-colors hover:bg-[#fb923c] cursor-pointer"
          >
            Fly Again
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="rounded-xl border border-white/15 bg-[#231b20] px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-[#f5ebe0] transition-colors hover:border-[#2dd4bf] cursor-pointer"
          >
            Title
          </button>
        </div>
      </div>
    </div>
  );
};
