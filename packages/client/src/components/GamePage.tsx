/**
 * 8-Ball Pool - Game Page Component
 * Main game screen integrating canvas, controls, and game logic
 */

import { useState, useCallback, useEffect } from 'react';
import { TableState, ShotParams, createInitialTableState } from '@8ball/shared';
import { GameCanvas } from './GameCanvas';
import { GameControls } from './GameControls';
import { useAimSystem } from '../hooks/useAimSystem';
import './GamePage.css';

interface GamePageProps {
    tableState?: TableState;
    isMyTurn?: boolean;
    playerSeat?: 1 | 2;
    onSubmitShot?: (params: ShotParams) => void;
    onPlaceBall?: (position: { x: number; y: number }) => void;
}

export function GamePage({
    tableState: propTableState,
    isMyTurn = true,
    playerSeat = 1,
    onSubmitShot,
    onPlaceBall,
}: GamePageProps) {
    // Use provided state or create initial state for development
    const [localTableState, _setLocalTableState] = useState<TableState>(
        () => propTableState || createInitialTableState()
    );

    const tableState = propTableState || localTableState;
    const [isSimulating, setIsSimulating] = useState(false);

    // Aim system hook
    const {
        aimState,
        cueBall,
        trajectoryPreview,
        handleAimStart,
        handleAimMove,
        handleAimEnd,
        setPower,
        setSpin,
        getShotParams,
    } = useAimSystem(tableState, isMyTurn);

    // Determine if player can shoot
    const canShoot = isMyTurn &&
        tableState.turnSeat === playerSeat &&
        tableState.phase !== 'BALL_IN_HAND' &&
        tableState.phase !== 'FINISHED' &&
        !isSimulating;

    // Determine if placing ball
    const isPlacingBall = tableState.ballInHand && tableState.turnSeat === playerSeat;

    // Handle shot submission
    const handleShoot = useCallback(() => {
        if (!canShoot) return;

        const params = getShotParams();
        console.log('Shooting with params:', params);

        if (onSubmitShot) {
            setIsSimulating(true);
            onSubmitShot(params);
            // Simulation will be turned off when new state arrives
        }
    }, [canShoot, getShotParams, onSubmitShot]);

    // Handle canvas click for aiming or ball placement
    const handleCanvasClick = useCallback((tableX: number, tableY: number) => {
        if (isPlacingBall) {
            if (onPlaceBall) {
                onPlaceBall({ x: tableX, y: tableY });
            }
        } else {
            handleAimStart(tableX, tableY);
        }
    }, [isPlacingBall, onPlaceBall, handleAimStart]);

    // Update local state when prop changes
    useEffect(() => {
        if (propTableState) {
            setIsSimulating(false);
        }
    }, [propTableState]);

    // Get opponent group info for display
    const getGroupInfo = () => {
        if (tableState.openTable) {
            return 'Open Table - Any group';
        }
        const myGroup = playerSeat === 1
            ? tableState.groups.seat1Group
            : tableState.groups.seat2Group;
        return myGroup ? `Playing ${myGroup.toLowerCase()}` : 'No group';
    };

    return (
        <div className="game-page">
            {/* Game header */}
            <div className="game-header">
                <div className="turn-indicator">
                    {tableState.phase === 'FINISHED' ? (
                        <span className="winner-text">
                            🏆 {tableState.winningSeat === playerSeat ? 'You Win!' : 'Opponent Wins'}
                        </span>
                    ) : (
                        <span className={isMyTurn ? 'your-turn' : 'their-turn'}>
                            {isMyTurn ? '🎯 Your Turn' : '⏳ Opponent\'s Turn'}
                        </span>
                    )}
                </div>
                <div className="game-info">
                    <span className="group-info">{getGroupInfo()}</span>
                    {tableState.phase === 'AWAITING_BREAK' && (
                        <span className="phase-indicator">Break Shot</span>
                    )}
                    {isPlacingBall && (
                        <span className="phase-indicator ball-in-hand">
                            🖐️ {tableState.ballInHandAnywhere ? 'Place ball anywhere' : 'Place behind head string'}
                        </span>
                    )}
                </div>
            </div>

            {/* Game canvas */}
            <div className="canvas-wrapper">
                <GameCanvas
                    tableState={tableState}
                    aimAngle={aimState.angle}
                    aimPower={aimState.power}
                    cueBallPos={cueBall?.pos}
                    trajectoryLine={trajectoryPreview.line}
                    collision={trajectoryPreview.collision}
                    isAiming={isMyTurn && aimState.isDragging}
                    onCanvasClick={handleCanvasClick}
                    onCanvasMove={handleAimMove}
                    onCanvasRelease={handleAimEnd}
                />
            </div>

            {/* Game controls */}
            {isMyTurn && !isPlacingBall && tableState.phase !== 'FINISHED' && (
                <GameControls
                    power={aimState.power}
                    spinX={aimState.spinX}
                    spinY={aimState.spinY}
                    onPowerChange={setPower}
                    onSpinChange={setSpin}
                    onShoot={handleShoot}
                    canShoot={canShoot}
                    isSimulating={isSimulating}
                />
            )}

            {/* Last shot summary */}
            {tableState.lastShotSummary && (
                <div className="shot-summary">
                    {tableState.lastShotSummary.foul && (
                        <div className="foul-indicator">
                            ❌ Foul: {tableState.lastShotSummary.foulReason}
                        </div>
                    )}
                    {tableState.lastShotSummary.pocketedBalls.length > 0 && (
                        <div className="pocketed-indicator">
                            🎱 Pocketed: {tableState.lastShotSummary.pocketedBalls.join(', ')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
