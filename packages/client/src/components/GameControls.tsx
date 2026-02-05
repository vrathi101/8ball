/**
 * 8-Ball Pool - Game Controls Component
 * Power bar and spin control UI
 */

import { useCallback, useState } from 'react';
import './GameControls.css';

interface GameControlsProps {
    power: number;
    spinX: number;
    spinY: number;
    onPowerChange: (power: number) => void;
    onSpinChange: (spinX: number, spinY: number) => void;
    onShoot: () => void;
    canShoot: boolean;
    isSimulating: boolean;
}

export function GameControls({
    power,
    spinX,
    spinY,
    onPowerChange,
    onSpinChange,
    onShoot,
    canShoot,
    isSimulating,
}: GameControlsProps) {
    const [isDraggingPower, setIsDraggingPower] = useState(false);
    const [isDraggingSpin, setIsDraggingSpin] = useState(false);

    // Power bar handlers
    const handlePowerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        setIsDraggingPower(true);
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const power = 1 - (y / rect.height);
        onPowerChange(Math.max(0.05, Math.min(1, power)));
    }, [onPowerChange]);

    const handlePowerMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDraggingPower) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const power = 1 - (y / rect.height);
        onPowerChange(Math.max(0.05, Math.min(1, power)));
    }, [isDraggingPower, onPowerChange]);

    const handlePowerMouseUp = useCallback(() => {
        setIsDraggingPower(false);
    }, []);

    // Spin control handlers
    const handleSpinMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        setIsDraggingSpin(true);
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
        onSpinChange(x, y);
    }, [onSpinChange]);

    const handleSpinMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDraggingSpin) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
        const y = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
        onSpinChange(x, y);
    }, [isDraggingSpin, onSpinChange]);

    const handleSpinMouseUp = useCallback(() => {
        setIsDraggingSpin(false);
    }, []);

    const resetSpin = useCallback(() => {
        onSpinChange(0, 0);
    }, [onSpinChange]);

    return (
        <div className="game-controls">
            {/* Power Bar */}
            <div className="control-section power-section">
                <div className="control-label">Power</div>
                <div
                    className="power-bar"
                    onMouseDown={handlePowerMouseDown}
                    onMouseMove={handlePowerMouseMove}
                    onMouseUp={handlePowerMouseUp}
                    onMouseLeave={handlePowerMouseUp}
                >
                    <div
                        className="power-fill"
                        style={{ height: `${power * 100}%` }}
                    />
                    <div
                        className="power-indicator"
                        style={{ bottom: `${power * 100}%` }}
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
                        <span className="shoot-text">⏳</span>
                    ) : (
                        <span className="shoot-text">SHOOT</span>
                    )}
                </button>
            </div>

            {/* Spin Control */}
            <div className="control-section spin-section">
                <div className="control-label">Spin</div>
                <div
                    className="spin-pad"
                    onMouseDown={handleSpinMouseDown}
                    onMouseMove={handleSpinMouseMove}
                    onMouseUp={handleSpinMouseUp}
                    onMouseLeave={handleSpinMouseUp}
                    onDoubleClick={resetSpin}
                    title="Double-click to reset"
                >
                    <div className="spin-ball">
                        <div
                            className="spin-dot"
                            style={{
                                left: `${50 + spinX * 40}%`,
                                top: `${50 + spinY * 40}%`,
                            }}
                        />
                    </div>
                </div>
                <div className="spin-labels">
                    <span>↺</span>
                    <span>↻</span>
                </div>
            </div>
        </div>
    );
}
