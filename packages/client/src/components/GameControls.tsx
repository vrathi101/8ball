/**
 * 8-Ball Pool - Game Controls Component
 * Power bar (horizontal) and shoot button
 */

import { useCallback, useState, useRef } from 'react';
import './GameControls.css';

interface GameControlsProps {
    power: number;
    onPowerChange: (power: number) => void;
    onShoot: () => void;
    canShoot: boolean;
    isSimulating: boolean;
}

export function GameControls({
    power,
    onPowerChange,
    onShoot,
    canShoot,
    isSimulating,
}: GameControlsProps) {
    const [isDraggingPower, setIsDraggingPower] = useState(false);
    const powerBarRef = useRef<HTMLDivElement>(null);

    // Power bar handlers (horizontal)
    const computePowerFromX = useCallback((clientX: number) => {
        const el = powerBarRef.current;
        if (!el) return 0.5;
        const rect = el.getBoundingClientRect();
        const x = clientX - rect.left;
        return Math.max(0.05, Math.min(1, x / rect.width));
    }, []);

    const handlePowerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        setIsDraggingPower(true);
        onPowerChange(computePowerFromX(e.clientX));
    }, [onPowerChange, computePowerFromX]);

    const handlePowerMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDraggingPower) return;
        onPowerChange(computePowerFromX(e.clientX));
    }, [isDraggingPower, onPowerChange, computePowerFromX]);

    const handlePowerMouseUp = useCallback(() => {
        setIsDraggingPower(false);
    }, []);

    // Touch power handlers
    const handlePowerTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingPower(true);
        onPowerChange(computePowerFromX(e.touches[0].clientX));
    }, [onPowerChange, computePowerFromX]);

    const handlePowerTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!isDraggingPower) return;
        onPowerChange(computePowerFromX(e.touches[0].clientX));
    }, [isDraggingPower, onPowerChange, computePowerFromX]);

    const handlePowerTouchEnd = useCallback(() => {
        setIsDraggingPower(false);
    }, []);

    return (
        <div className="game-controls">
            {/* Power Bar (horizontal) */}
            <div className="control-section power-section">
                <div className="control-label">Power</div>
                <div
                    className="power-bar"
                    ref={powerBarRef}
                    onMouseDown={handlePowerMouseDown}
                    onMouseMove={handlePowerMouseMove}
                    onMouseUp={handlePowerMouseUp}
                    onMouseLeave={handlePowerMouseUp}
                    onTouchStart={handlePowerTouchStart}
                    onTouchMove={handlePowerTouchMove}
                    onTouchEnd={handlePowerTouchEnd}
                >
                    <div
                        className="power-fill"
                        style={{ width: `${power * 100}%` }}
                    />
                    <div
                        className="power-indicator"
                        style={{ left: `${power * 100}%` }}
                    />
                </div>
                <div className="power-value">{Math.round(power * 100)}%</div>
            </div>

            {/* Shoot Button */}
            <div className="control-section shoot-section">
                <button
                    className={`shoot-button ${canShoot ? 'active' : ''} ${isSimulating ? 'simulating' : ''}`}
                    onClick={onShoot}
                    disabled={!canShoot || isSimulating}
                >
                    {isSimulating ? (
                        <span className="shoot-text">...</span>
                    ) : (
                        <span className="shoot-text">SHOOT</span>
                    )}
                </button>
            </div>
        </div>
    );
}
