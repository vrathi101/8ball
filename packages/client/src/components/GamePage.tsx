/**
 * 8-Ball Pool - Game Page Component
 * Main game screen integrating canvas, controls, and game logic
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { TableState, ShotParams, createInitialTableState, simulateShot, applyRules } from '@8ball/shared';
import { GameCanvas } from './GameCanvas';
import { GameControls } from './GameControls';
import { useAimSystem } from '../hooks/useAimSystem';
import { useAnimationPlayback } from '../hooks/useAnimationPlayback';
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
    const [localTableState, setLocalTableState] = useState<TableState>(
        () => propTableState || createInitialTableState()
    );

    const tableState = propTableState || localTableState;
    const [isSimulating, setIsSimulating] = useState(false);

    // Animation playback hook
    const { isAnimating, animatedBalls, playAnimation } = useAnimationPlayback();

    // Create a display table state that uses animated balls during animation
    const displayTableState = useMemo((): TableState => {
        if (isAnimating && animatedBalls) {
            return {
                ...tableState,
                balls: animatedBalls,
            };
        }
        return tableState;
    }, [tableState, isAnimating, animatedBalls]);

    // Aim system hook - use display state for visuals
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
    } = useAimSystem(displayTableState, isMyTurn && !isAnimating);

    // Determine if player can shoot
    const canShoot = isMyTurn &&
        tableState.turnSeat === playerSeat &&
        tableState.phase !== 'BALL_IN_HAND' &&
        tableState.phase !== 'FINISHED' &&
        !isSimulating &&
        !isAnimating;

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
        } else {
            // Local dev mode - simulate locally with animation
            setIsSimulating(true);
            try {
                const result = simulateShot(tableState, params);
                const newState = applyRules(result.finalState, result.summary);
                console.log('Shot result:', result.summary, 'Keyframes:', result.keyframes.length);

                // Play animation, then update state when complete
                playAnimation(result.keyframes, newState, (finalState) => {
                    setLocalTableState(finalState);
                    setIsSimulating(false);
                });
            } catch (err) {
                console.error('Shot error:', err);
                setIsSimulating(false);
            }
        }
    }, [canShoot, getShotParams, onSubmitShot, tableState, playAnimation]);

    // Handle ball placement for local dev mode
    const handleLocalPlaceBall = useCallback((tableX: number, tableY: number) => {
        if (!isPlacingBall) return;

        // Update cue ball position
        setLocalTableState(prev => ({
            ...prev,
            balls: prev.balls.map(b =>
                b.id === 'cue' ? { ...b, pos: { x: tableX, y: tableY }, inPlay: true } : b
            ),
            ballInHand: false,
            ballInHandAnywhere: false,
        }));
    }, [isPlacingBall]);

    // Handle canvas click for aiming or ball placement
    const handleCanvasClick = useCallback((tableX: number, tableY: number) => {
        if (isAnimating) return; // Ignore clicks during animation

        if (isPlacingBall) {
            if (onPlaceBall) {
                onPlaceBall({ x: tableX, y: tableY });
            } else {
                // Local dev mode
                handleLocalPlaceBall(tableX, tableY);
            }
        } else {
            handleAimStart(tableX, tableY);
        }
    }, [isPlacingBall, onPlaceBall, handleAimStart, isAnimating, handleLocalPlaceBall]);

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
                    ) : isAnimating ? (
                        <span className="animating">🎱 Balls in motion...</span>
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
                    {isPlacingBall && !isAnimating && (
                        <span className="phase-indicator ball-in-hand">
                            🖐️ {tableState.ballInHandAnywhere ? 'Place ball anywhere' : 'Place behind head string'}
                        </span>
                    )}
                </div>
            </div>

            {/* Game canvas */}
            <div className="canvas-wrapper">
                <GameCanvas
                    tableState={displayTableState}
                    aimAngle={aimState.angle}
                    aimPower={aimState.power}
                    cueBallPos={cueBall?.pos}
                    trajectoryLine={trajectoryPreview.line}
                    collision={trajectoryPreview.collision}
                    isAiming={isMyTurn && !isPlacingBall && !isAnimating && tableState.phase !== 'FINISHED'}
                    onCanvasClick={handleCanvasClick}
                    onCanvasMove={handleAimMove}
                    onCanvasRelease={handleAimEnd}
                />
            </div>

            {/* Game controls */}
            {isMyTurn && !isPlacingBall && !isAnimating && tableState.phase !== 'FINISHED' && (
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
            {tableState.lastShotSummary && !isAnimating && (
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
