/**
 * 8-Ball Pool - Game Page Component
 * Main game screen integrating canvas, controls, and game logic
 */

import { useState, useCallback, useEffect, useMemo, useRef, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import { TableState, ShotParams, BallState, BallId, createInitialTableState, simulateShot, applyRules, isGroupCleared } from '@8ball/shared';
import { BALL_COLORS, STRIPE_BALL_IDS } from '@8ball/shared';
import { GameCanvas } from './GameCanvas';
import { GameControls } from './GameControls';
import { useAimSystem } from '../hooks/useAimSystem';
import { useAnimationPlayback } from '../hooks/useAnimationPlayback';
import { useSoundManager } from '../audio/useSoundManager';
import './GamePage.css';

// Spin control overlay component (positioned top-right of canvas like GamePigeon)
function SpinOverlay({ spinX, spinY, onSpinChange }: {
    spinX: number;
    spinY: number;
    onSpinChange: (x: number, y: number) => void;
}) {
    const [isDragging, setIsDragging] = useState(false);

    const computeSpin = useCallback((el: HTMLElement, clientX: number, clientY: number) => {
        const rect = el.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
        const y = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1));
        onSpinChange(x, y);
    }, [onSpinChange]);

    const handleMouseDown = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
        setIsDragging(true);
        computeSpin(e.currentTarget, e.clientX, e.clientY);
    }, [computeSpin]);

    const handleMouseMove = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        computeSpin(e.currentTarget, e.clientX, e.clientY);
    }, [isDragging, computeSpin]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleTouchStart = useCallback((e: ReactTouchEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        computeSpin(e.currentTarget, e.touches[0].clientX, e.touches[0].clientY);
    }, [computeSpin]);

    const handleTouchMove = useCallback((e: ReactTouchEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragging) return;
        computeSpin(e.currentTarget, e.touches[0].clientX, e.touches[0].clientY);
    }, [isDragging, computeSpin]);

    const handleTouchEnd = useCallback((e: ReactTouchEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    return (
        <div className="spin-overlay">
            <div
                className="spin-overlay-pad"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div className="spin-overlay-ball">
                    <div
                        className="spin-overlay-dot"
                        style={{
                            left: `${50 + spinX * 40}%`,
                            top: `${50 + spinY * 40}%`,
                        }}
                    />
                </div>
            </div>
            <button
                className="spin-reset-btn"
                onClick={() => onSpinChange(0, 0)}
                onTouchEnd={(e) => { e.stopPropagation(); onSpinChange(0, 0); }}
            >
                Reset
            </button>
        </div>
    );
}

interface PlayerInfo {
    seat: 1 | 2;
    displayName: string;
    online: boolean;
}

interface GamePageProps {
    tableState?: TableState;
    isMyTurn?: boolean;
    playerSeat?: 1 | 2;
    onSubmitShot?: (params: ShotParams) => void;
    onPlaceBall?: (position: { x: number; y: number }) => void;
    players?: PlayerInfo[];
    gameVersion?: number;
    isAnimating?: boolean;
    practiceMode?: boolean;
}

export function GamePage({
    tableState: propTableState,
    isMyTurn = true,
    playerSeat = 1,
    onSubmitShot,
    onPlaceBall,
    players,
    isAnimating: externalAnimating,
    practiceMode = false,
}: GamePageProps) {
    // Use provided state or create initial state for development
    const [localTableState, setLocalTableState] = useState<TableState>(
        () => propTableState || createInitialTableState()
    );

    const isMultiplayer = !!propTableState;
    const tableState = propTableState || localTableState;
    const [isSimulating, setIsSimulating] = useState(false);

    // Track previous balls for pocket animation
    const prevBallsRef = useRef<BallState[]>(tableState.balls);
    const [previousBalls, setPreviousBalls] = useState<BallState[]>(tableState.balls);

    useEffect(() => {
        setPreviousBalls(prevBallsRef.current);
        prevBallsRef.current = tableState.balls;
    }, [tableState.balls]);

    // Foul banner state
    const [foulBanner, setFoulBanner] = useState<string | null>(null);
    const foulTimerRef = useRef<ReturnType<typeof setTimeout>>();

    // Turn banner state
    const [turnBanner, setTurnBanner] = useState<{ text: string; isYours: boolean } | null>(null);
    const turnTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const prevTurnSeatRef = useRef(tableState.turnSeat);

    // Call pocket state for 8-ball
    const [calledPocket, setCalledPocket] = useState<number | null>(null);
    const [showCallPocket, setShowCallPocket] = useState(false);

    // Sound manager
    const { soundManager } = useSoundManager();

    // Animation playback hook (only used in dev/local mode)
    const { isAnimating: localAnimating, animatedBalls: localAnimatedBalls, playAnimation } = useAnimationPlayback(soundManager);

    // In multiplayer mode, animation is managed by GameRoom
    const isAnimating = isMultiplayer ? (externalAnimating || false) : localAnimating;

    // Create a display table state that uses animated balls during animation
    const displayTableState = useMemo((): TableState => {
        if (!isMultiplayer && localAnimating && localAnimatedBalls) {
            return {
                ...tableState,
                balls: localAnimatedBalls,
            };
        }
        return tableState;
    }, [tableState, isMultiplayer, localAnimating, localAnimatedBalls]);

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

    // Check if player should call pocket (group cleared, shooting 8-ball) — skip in practice
    const shouldCallPocket = useMemo(() => {
        if (practiceMode) return false;
        if (tableState.openTable || tableState.phase === 'FINISHED') return false;
        return isGroupCleared(tableState, playerSeat) && isMyTurn;
    }, [tableState, playerSeat, isMyTurn, practiceMode]);

    // Show call pocket overlay when needed
    useEffect(() => {
        if (shouldCallPocket && !isAnimating && !isSimulating) {
            setShowCallPocket(true);
        } else {
            setShowCallPocket(false);
        }
    }, [shouldCallPocket, isAnimating, isSimulating]);

    // Determine if placing ball (also during break for cue placement)
    const isPlacingBall = tableState.ballInHand && tableState.turnSeat === playerSeat;

    // Determine if player can shoot
    const canShoot = isMyTurn &&
        tableState.turnSeat === playerSeat &&
        tableState.phase !== 'BALL_IN_HAND' &&
        tableState.phase !== 'FINISHED' &&
        !isPlacingBall &&
        !isSimulating &&
        !isAnimating &&
        (!shouldCallPocket || calledPocket !== null);

    // Show foul banner when lastShotSummary changes with a foul
    useEffect(() => {
        if (tableState.lastShotSummary?.foul && !isAnimating) {
            setFoulBanner(`Foul: ${tableState.lastShotSummary.foulReason}`);
            if (foulTimerRef.current) clearTimeout(foulTimerRef.current);
            foulTimerRef.current = setTimeout(() => setFoulBanner(null), 2000);
        }
    }, [tableState.lastShotSummary, isAnimating]);

    // Show turn banner on turn change
    useEffect(() => {
        if (tableState.turnSeat !== prevTurnSeatRef.current && tableState.phase !== 'FINISHED') {
            prevTurnSeatRef.current = tableState.turnSeat;
            const yours = tableState.turnSeat === playerSeat;
            setTurnBanner({ text: yours ? 'Your Turn!' : "Opponent's Turn", isYours: yours });
            if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
            turnTimerRef.current = setTimeout(() => setTurnBanner(null), 1500);

            // Reset called pocket on turn change
            setCalledPocket(null);
        }
    }, [tableState.turnSeat, tableState.phase, playerSeat]);

    // Handle shot submission
    const handleShoot = useCallback(() => {
        if (!canShoot) return;

        const params: ShotParams = {
            ...getShotParams(),
            calledPocket: calledPocket ?? undefined,
        };

        if (onSubmitShot) {
            setIsSimulating(true);
            onSubmitShot(params);
        } else {
            // Local dev/practice mode - simulate locally with animation
            setIsSimulating(true);
            try {
                const result = simulateShot(tableState, params);

                // In practice mode, suppress group-related fouls and keep turn
                if (practiceMode) {
                    if (result.summary.foul === 'WRONG_BALL_FIRST') {
                        result.summary.foul = null;
                        result.summary.foulReason = null;
                    }
                    // Never change turns in practice - always player's turn
                    result.summary.turnChanged = false;
                }

                let newState = applyRules(result.finalState, result.summary);

                // In practice mode, always keep turn on player and keep aiming
                if (practiceMode && newState.phase !== 'FINISHED') {
                    newState = {
                        ...newState,
                        turnSeat: playerSeat,
                    };
                }

                playAnimation(result.keyframes, newState, (finalState) => {
                    setLocalTableState(finalState);
                    setIsSimulating(false);
                });
            } catch (err) {
                console.error('Shot error:', err);
                setIsSimulating(false);
            }
        }
    }, [canShoot, getShotParams, calledPocket, onSubmitShot, tableState, playAnimation]);

    // Reset game for practice mode
    const handleReset = useCallback(() => {
        setLocalTableState(createInitialTableState());
        setIsSimulating(false);
        setFoulBanner(null);
        setTurnBanner(null);
        setCalledPocket(null);
        setShowCallPocket(false);
    }, []);

    // Handle ball placement for local dev mode
    const handleLocalPlaceBall = useCallback((tableX: number, tableY: number) => {
        if (!isPlacingBall) return;

        setLocalTableState(prev => ({
            ...prev,
            balls: prev.balls.map(b =>
                b.id === 'cue' ? { ...b, pos: { x: tableX, y: tableY }, inPlay: true } : b
            ),
            ballInHand: false,
            ballInHandAnywhere: false,
            phase: prev.phase === 'AWAITING_BREAK' ? 'AWAITING_BREAK' : 'AIMING',
        }));
    }, [isPlacingBall]);

    // Handle canvas click for aiming or ball placement
    const handleCanvasClick = useCallback((tableX: number, tableY: number) => {
        if (isAnimating) return;

        if (isPlacingBall) {
            if (onPlaceBall) {
                onPlaceBall({ x: tableX, y: tableY });
            } else {
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

    // Get group info for display
    const getGroupInfo = () => {
        if (practiceMode) return 'Practice - Hit any ball';
        if (tableState.openTable) return 'Open Table - Any group';
        const myGroup = playerSeat === 1
            ? tableState.groups.seat1Group
            : tableState.groups.seat2Group;
        return myGroup ? `Playing ${myGroup.toLowerCase()}` : 'No group';
    };

    // Get pocketed balls per group for ball tray
    const getPocketedByGroup = (group: 'solids' | 'stripes'): BallId[] => {
        return tableState.pocketed.filter(id => {
            if (id === 'cue' || id === '8') return false;
            const num = parseInt(id, 10);
            return group === 'solids' ? num <= 7 : num >= 9;
        });
    };

    const myGroup = playerSeat === 1 ? tableState.groups.seat1Group : tableState.groups.seat2Group;
    const opponentGroup = playerSeat === 1 ? tableState.groups.seat2Group : tableState.groups.seat1Group;

    return (
        <div className="game-page">
            {/* Foul banner */}
            {foulBanner && <div className="foul-banner">{foulBanner}</div>}

            {/* Turn banner */}
            {turnBanner && (
                <div className={`turn-banner ${turnBanner.isYours ? 'your-turn' : 'their-turn'}`}>
                    {turnBanner.text}
                </div>
            )}

            {/* Game header */}
            <div className="game-header">
                <div className="header-left">
                    <div className="turn-indicator">
                        {practiceMode ? (
                            tableState.phase === 'FINISHED' ? (
                                <span className="winner-text">Game Over</span>
                            ) : isAnimating ? (
                                <span className="animating">Balls in motion...</span>
                            ) : (
                                <span className="your-turn">Practice Mode</span>
                            )
                        ) : tableState.phase === 'FINISHED' ? (
                            <span className="winner-text">
                                {tableState.winningSeat === playerSeat ? 'You Win!' : 'Opponent Wins'}
                            </span>
                        ) : isAnimating ? (
                            <span className="animating">Balls in motion...</span>
                        ) : (
                            <span className={isMyTurn ? 'your-turn' : 'their-turn'}>
                                {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
                            </span>
                        )}
                    </div>
                    {players && (
                        <div className="player-names">
                            {players.map(p => (
                                <span key={p.seat} className={`player-name ${p.seat === playerSeat ? 'me' : 'opponent'}`}>
                                    <span className={`status-dot ${p.online ? 'online' : 'offline'}`} />
                                    {p.displayName}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="game-info">
                    <span className="group-info">{getGroupInfo()}</span>
                    {tableState.phase === 'AWAITING_BREAK' && (
                        <span className="phase-indicator">Break Shot</span>
                    )}
                    {isPlacingBall && !isAnimating && (
                        <span className="phase-indicator ball-in-hand">
                            {tableState.ballInHandAnywhere ? 'Place ball anywhere' : 'Place behind head string'}
                        </span>
                    )}
                    {showCallPocket && calledPocket === null && (
                        <span className="phase-indicator call-pocket">Click a pocket for the 8-ball</span>
                    )}
                    {practiceMode && (
                        <button className="reset-btn" onClick={handleReset}>Reset</button>
                    )}
                </div>
            </div>

            {/* Ball trays */}
            {!tableState.openTable && !practiceMode && (
                <div className="ball-trays">
                    <div className="ball-tray-group">
                        <span className="tray-label">{myGroup === 'SOLIDS' ? 'Solids' : 'Stripes'} (You)</span>
                        <div className="ball-tray">
                            {getPocketedByGroup(myGroup === 'SOLIDS' ? 'solids' : 'stripes').map(id => (
                                <div key={id} className="ball-tray-ball"
                                    style={{ background: BALL_COLORS[id] || '#fff' }}>
                                    {STRIPE_BALL_IDS.includes(id as typeof STRIPE_BALL_IDS[number]) ? '' : id}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="ball-tray-group">
                        <span className="tray-label">{opponentGroup === 'SOLIDS' ? 'Solids' : 'Stripes'} (Opp)</span>
                        <div className="ball-tray">
                            {getPocketedByGroup(opponentGroup === 'SOLIDS' ? 'solids' : 'stripes').map(id => (
                                <div key={id} className="ball-tray-ball"
                                    style={{ background: BALL_COLORS[id] || '#fff' }}>
                                    {STRIPE_BALL_IDS.includes(id as typeof STRIPE_BALL_IDS[number]) ? '' : id}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Game canvas */}
            <div className="canvas-wrapper">
                <GameCanvas
                    tableState={displayTableState}
                    aimAngle={aimState.angle}
                    aimPower={aimState.power}
                    cueBallPos={cueBall?.pos}
                    trajectoryLine={trajectoryPreview.line}
                    collision={trajectoryPreview.collision}
                    isAiming={isMyTurn && !isPlacingBall && !isAnimating && tableState.phase !== 'FINISHED' && !showCallPocket}
                    onCanvasClick={handleCanvasClick}
                    onCanvasMove={handleAimMove}
                    onCanvasRelease={handleAimEnd}
                    callingPocket={showCallPocket}
                    onPocketClick={(idx) => setCalledPocket(idx)}
                    selectedPocket={calledPocket}
                    previousBalls={previousBalls}
                />

                {/* Spin Control Overlay (top-right of canvas) */}
                {isMyTurn && !isPlacingBall && !isAnimating && (practiceMode || tableState.phase !== 'FINISHED') && (
                    <SpinOverlay
                        spinX={aimState.spinX}
                        spinY={aimState.spinY}
                        onSpinChange={setSpin}
                    />
                )}
            </div>

            {/* Game controls */}
            {isMyTurn && !isPlacingBall && !isAnimating && (practiceMode || tableState.phase !== 'FINISHED') && (
                <GameControls
                    power={aimState.power}
                    onPowerChange={setPower}
                    onShoot={handleShoot}
                    canShoot={canShoot}
                    isSimulating={isSimulating}
                />
            )}

            {/* Last shot summary */}
            {tableState.lastShotSummary && !isAnimating && (
                <div className="shot-summary">
                    {tableState.lastShotSummary.pocketedBalls.length > 0 && (
                        <div className="pocketed-indicator">
                            Pocketed: {tableState.lastShotSummary.pocketedBalls.join(', ')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
