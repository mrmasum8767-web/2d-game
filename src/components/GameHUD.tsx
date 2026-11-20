import React, { useRef, useState } from 'react';
import { GameHudSnapshot } from '../game/types';

interface GameHUDProps {
  hud: GameHudSnapshot;
  showTouchControls: boolean;
  onToggleTouchControls: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onVirtualSteer: (x: number, y: number) => void;
  onVirtualBoost: (active: boolean) => void;
  onVirtualFire: (active: boolean) => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  showTouchControls,
  onToggleTouchControls,
  onToggleMute,
  onPause,
  onVirtualSteer,
  onVirtualBoost,
  onVirtualFire,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [boostPressed, setBoostPressed] = useState(false);
  const [firePressed, setFirePressed] = useState(false);

  if (hud.phase !== 'playing') return null;

  const updateStickFromPointer = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxRadius = rect.width * 0.36;

    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);

    const kx = dist > 0 ? Math.cos(angle) * clampedDist : 0;
    const ky = dist > 0 ? Math.sin(angle) * clampedDist : 0;

    setKnobPos({ x: kx, y: ky });
    // +Y is climb (up = negative screen dy)
    onVirtualSteer(kx / maxRadius, -ky / maxRadius);
  };

  const resetStick = () => {
    activePointerIdRef.current = null;
    setKnobPos({ x: 0, y: 0 });
    onVirtualSteer(0, 0);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
      {/* Perimeter Top Bar — zero mid-screen occlusion, no backdrop-filter */}
      <div className="flex items-start justify-between gap-3">
        {/* Top-Left: Hull Integrity & Solar Boost Capacitor */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#f59e0b]/25 bg-[#120e12]/80 px-3.5 py-2.5 shadow-lg">
          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2L4 5.5V11.5C4 16.8 7.4 21.4 12 22.8C16.6 21.4 20 16.8 20 11.5V5.5L12 2Z"
                stroke="#f97316"
                strokeWidth="2"
                fill="rgba(249, 115, 22, 0.16)"
              />
            </svg>
            <div className="flex items-center gap-1.5" aria-label={`Hull ${hud.hull} of ${hud.maxHull}`}>
              {Array.from({ length: hud.maxHull }).map((_, idx) => {
                const active = idx < hud.hull;
                return (
                  <span
                    key={idx}
                    className={`h-2.5 w-6 rounded-sm transition-colors duration-150 ${
                      active
                        ? 'bg-[#f97316] shadow-[0_0_8px_rgba(249,115,22,0.55)]'
                        : 'bg-[#2c2428]'
                    }`}
                  />
                );
              })}
            </div>
            <span className="ml-1 text-[11px] font-semibold tracking-wider text-[#d6c7bc] tabular-nums">
              {hud.shieldCharge}%
            </span>
          </div>

          {/* Boost Bar */}
          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M13 2L4 14H11L10 22L20 10H13L13 2Z"
                stroke="#2dd4bf"
                strokeWidth="2"
                strokeLinejoin="round"
                fill="rgba(45, 212, 191, 0.16)"
              />
            </svg>
            <div className="h-2 w-28 overflow-hidden rounded-sm bg-[#272024]">
              <div
                className="h-full transition-[width] duration-75"
                style={{
                  width: `${hud.boostEnergy}%`,
                  backgroundColor: hud.isBoosting ? '#fbbf24' : '#2dd4bf',
                }}
              />
            </div>
            <span className="text-[11px] font-semibold tracking-wider text-[#99f6e4] tabular-nums">
              {hud.speedKmh} <span className="text-[10px] font-normal text-[#a8988e]">KM/H</span>
            </span>
          </div>
        </div>

        {/* Top-Center: Sector, Distance & Combo Multiplier */}
        <div className="hidden sm:flex items-center gap-4 rounded-xl border border-[#f59e0b]/20 bg-[#120e12]/80 px-4 py-2 shadow-lg">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d97706]">
              Sector {hud.sectorIndex} · {hud.sectorName}
            </span>
            <span className="text-lg font-bold tracking-tight text-[#fff7ed] tabular-nums">
              {hud.distance.toLocaleString()} <span className="text-xs font-medium text-[#b8a99e]">m</span>
            </span>
          </div>
          {hud.combo > 1 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-[#2dd4bf]/40 bg-[#0f2928] px-2.5 py-1">
              <span className="text-xs font-bold tracking-wide text-[#5eead4] tabular-nums">
                ×{hud.combo}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#99f6e4]">
                Combo
              </span>
            </div>
          )}
        </div>

        {/* Top-Right: Score + Pause, Mute & On-Screen Controls Toggle */}
        <div className="flex items-start gap-2">
          <div className="rounded-xl border border-[#f59e0b]/25 bg-[#120e12]/80 px-3.5 py-2 text-right shadow-lg">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#b8a99e]">
              Score
            </div>
            <div className="text-xl font-bold leading-tight tracking-tight text-[#fff7ed] tabular-nums">
              {hud.score.toLocaleString()}
            </div>
          </div>

          <div className="pointer-events-auto flex flex-col gap-1.5">
            <button
              type="button"
              onClick={onPause}
              aria-label="Pause Game"
              title="Pause & Controls Settings (Esc)"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#f59e0b]/25 bg-[#120e12]/85 text-[#f5ebe0] transition-colors hover:border-[#f97316] hover:text-[#fbbf24] cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={hud.muted ? 'Unmute Audio' : 'Mute Audio'}
              title="Toggle Audio (M)"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#f59e0b]/25 bg-[#120e12]/85 text-[#f5ebe0] transition-colors hover:border-[#2dd4bf] hover:text-[#5eead4] cursor-pointer"
            >
              {hud.muted ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M11 5L6 9H2V15H6L11 19V5Z" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M11 5L6 9H2V15H6L11 19V5Z" />
                  <path d="M15.5 8.5C16.8 9.8 16.8 14.2 15.5 15.5" strokeLinecap="round" />
                  <path d="M18.5 5.5C21.2 8.2 21.2 15.8 18.5 18.5" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={onToggleTouchControls}
              aria-label={showTouchControls ? 'Hide On-Screen Controls' : 'Show On-Screen Controls'}
              title="Toggle On-Screen Flight Controls"
              className={`flex h-8 w-8 items-center justify-center rounded-lg border bg-[#120e12]/85 transition-colors cursor-pointer ${
                showTouchControls
                  ? 'border-[#2dd4bf]/60 text-[#5eead4]'
                  : 'border-[#f59e0b]/25 text-[#a8988e] hover:border-[#2dd4bf] hover:text-[#5eead4]'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="2" y="6" width="20" height="12" rx="4" />
                <path d="M6 12H10M8 10V14" strokeLinecap="round" />
                <circle cx="15.5" cy="11" r="1" fill="currentColor" />
                <circle cx="18" cy="13" r="1" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Perimeter: Mobile Distance/Combo + On-Screen Flight Gimbal & Action Triggers */}
      <div className="flex flex-col gap-2">
        <div className="flex sm:hidden items-center justify-between text-xs font-semibold text-[#f5ebe0]/90">
          <span className="rounded-lg bg-[#120e12]/80 px-2.5 py-1 tabular-nums">
            {hud.distance.toLocaleString()} m
          </span>
          {hud.combo > 1 && (
            <span className="rounded-lg border border-[#2dd4bf]/40 bg-[#0f2928] px-2.5 py-1 text-[#5eead4] tabular-nums">
              ×{hud.combo} COMBO
            </span>
          )}
        </div>

        {showTouchControls && (
          <div className="flex items-end justify-between">
            {/* Bottom-Left: Virtual Flight Gimbal Stick */}
            <div
              ref={padRef}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                activePointerIdRef.current = e.pointerId;
                updateStickFromPointer(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (activePointerIdRef.current !== e.pointerId) return;
                e.stopPropagation();
                updateStickFromPointer(e.clientX, e.clientY);
              }}
              onPointerUp={(e) => {
                if (activePointerIdRef.current !== e.pointerId) return;
                e.stopPropagation();
                resetStick();
              }}
              onPointerCancel={(e) => {
                if (activePointerIdRef.current !== e.pointerId) return;
                resetStick();
              }}
              role="slider"
              aria-label="Flight Steering Stick"
              aria-valuetext="Steer Craft"
              className="pointer-events-auto relative flex h-28 w-28 touch-none items-center justify-center rounded-full border-2 border-[#f59e0b]/35 bg-[#120e12]/72 shadow-xl cursor-grab active:cursor-grabbing"
            >
              {/* Crosshair & Directional Guides */}
              <div className="pointer-events-none absolute inset-3 rounded-full border border-white/10" />
              <span className="pointer-events-none absolute top-1.5 text-[9px] font-bold text-[#e7d5c8]/60">▲</span>
              <span className="pointer-events-none absolute bottom-1.5 text-[9px] font-bold text-[#e7d5c8]/60">▼</span>
              <span className="pointer-events-none absolute left-2 text-[9px] font-bold text-[#e7d5c8]/60">◄</span>
              <span className="pointer-events-none absolute right-2 text-[9px] font-bold text-[#e7d5c8]/60">►</span>

              {/* Draggable Stick Thumb */}
              <div
                className="pointer-events-none flex h-11 w-11 items-center justify-center rounded-full border border-[#fdba74]/70 bg-[#f97316]/90 shadow-[0_0_14px_rgba(249,115,22,0.5)]"
                style={{
                  transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
                }}
              >
                <div className="h-3.5 w-3.5 rounded-full bg-[#fff7ed]/90" />
              </div>
            </div>

            {/* Bottom-Right: Boost & Plasma Fire Action Triggers */}
            <div className="pointer-events-auto flex items-end gap-3">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setBoostPressed(true);
                  onVirtualBoost(true);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  setBoostPressed(false);
                  onVirtualBoost(false);
                }}
                onPointerCancel={() => {
                  setBoostPressed(false);
                  onVirtualBoost(false);
                }}
                className={`flex h-16 w-16 touch-none flex-col items-center justify-center rounded-full border-2 text-[10px] font-extrabold uppercase tracking-wider shadow-xl transition-transform duration-75 cursor-pointer ${
                  boostPressed || hud.isBoosting
                    ? 'scale-95 border-[#fbbf24] bg-[#2dd4bf] text-[#101818]'
                    : 'border-[#2dd4bf]/60 bg-[#120e12]/80 text-[#5eead4] hover:border-[#2dd4bf]'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M13 2L4 14H11L10 22L20 10H13L13 2Z" strokeLinejoin="round" />
                </svg>
                <span className="mt-0.5">Boost</span>
              </button>

              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setFirePressed(true);
                  onVirtualFire(true);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  setFirePressed(false);
                  onVirtualFire(false);
                }}
                onPointerCancel={() => {
                  setFirePressed(false);
                  onVirtualFire(false);
                }}
                className={`flex h-20 w-20 touch-none flex-col items-center justify-center rounded-full border-2 text-[11px] font-extrabold uppercase tracking-wider shadow-xl transition-transform duration-75 cursor-pointer ${
                  firePressed
                    ? 'scale-95 border-[#fff7ed] bg-[#f97316] text-[#140c08]'
                    : 'border-[#f97316]/75 bg-[#181216]/85 text-[#fdba74] hover:border-[#fb923c]'
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <circle cx="12" cy="12" r="7" />
                  <line x1="12" y1="2" x2="12" y2="6" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="6" y2="12" />
                  <line x1="18" y1="12" x2="22" y2="12" />
                </svg>
                <span className="mt-0.5">Fire</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
