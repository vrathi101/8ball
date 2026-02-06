import { useState, useCallback, useEffect } from 'react';
import { useGameSocket } from '../hooks/useGameSocket';
import { useAnimationPlayback } from '../hooks/useAnimationPlayback';
import { GamePage } from './GamePage';
import { GameOverScreen } from './GameOverScreen';
import { loadCredentials, clearCredentials } from '../utils/credentials';
import type { TableState, KeyFrame, ShotParams } from '@8ball/shared';

interface GameRoomProps {
    gameId: string;
    onNavigate: (hash: string) => void;
}

export function GameRoom({ gameId, onNavigate }: GameRoomProps) {
    const creds = loadCredentials();
    const [displayState, setDisplayState] = useState<TableState | null>(null);
    const { isAnimating, animatedBalls, playAnimation } = useAnimationPlayback();

    const handleShotResult = useCallback((keyframes: KeyFrame[], newState: TableState) => {
        playAnimation(keyframes, newState, (finalState) => {
            setDisplayState(finalState);
        });
    }, [playAnimation]);

    const {
        isConnected,
        isAuthenticated,
        gameState,
        mySeat,
        isMyTurn,
        error,
        submitShot,
        placeBall,
    } = useGameSocket({
        gameId,
        playerToken: creds?.playerToken || '',
        onShotResult: handleShotResult,
    });

    // Sync display state from server when not animating
    useEffect(() => {
        if (gameState && !isAnimating) {
            setDisplayState(gameState.tableState);
        }
    }, [gameState, isAnimating]);

    const handleSubmitShot = useCallback((params: ShotParams) => {
        if (gameState) submitShot(params, gameState.version);
    }, [submitShot, gameState]);

    const handlePlaceBall = useCallback((position: { x: number; y: number }) => {
        if (gameState) placeBall(position, gameState.version);
    }, [placeBall, gameState]);

    const handlePlayAgain = () => {
        clearCredentials();
        onNavigate('#/');
    };

    if (!creds) {
        return (
            <div className="home-page">
                <p>No credentials found.</p>
                <button onClick={() => onNavigate('#/')}>Go Home</button>
            </div>
        );
    }

    if (!isConnected) {
        return <div className="home-page"><p>Connecting...</p></div>;
    }

    if (!isAuthenticated) {
        return <div className="home-page"><p>Authenticating...</p></div>;
    }

    if (error) {
        return (
            <div className="home-page">
                <p className="error-msg">{error}</p>
                <button onClick={() => onNavigate('#/')}>Go Home</button>
            </div>
        );
    }

    if (!gameState || !displayState) {
        return <div className="home-page"><p>Loading game...</p></div>;
    }

    const tableForDisplay: TableState = isAnimating && animatedBalls
        ? { ...displayState, balls: animatedBalls }
        : displayState;

    const isWaiting = gameState.status === 'WAITING';
    const isFinished = gameState.tableState.phase === 'FINISHED';

    if (isWaiting) {
        return (
            <div className="home-page">
                <h2>Waiting for opponent...</h2>
                <p>Share the invite link to start playing.</p>
            </div>
        );
    }

    return (
        <>
            <GamePage
                tableState={tableForDisplay}
                isMyTurn={isMyTurn && !isAnimating}
                playerSeat={mySeat || 1}
                onSubmitShot={handleSubmitShot}
                onPlaceBall={handlePlaceBall}
                players={gameState.players}
                gameVersion={gameState.version}
                isAnimating={isAnimating}
            />
            {isFinished && (
                <GameOverScreen
                    winningSeat={gameState.tableState.winningSeat}
                    playerSeat={mySeat || 1}
                    onPlayAgain={handlePlayAgain}
                    onGoHome={handlePlayAgain}
                />
            )}
        </>
    );
}
