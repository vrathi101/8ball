import type { Seat } from '@8ball/shared';

interface GameOverScreenProps {
    winningSeat: Seat | null;
    playerSeat: Seat;
    onPlayAgain: () => void;
    onGoHome: () => void;
}

export function GameOverScreen({ winningSeat, playerSeat, onPlayAgain, onGoHome }: GameOverScreenProps) {
    const isWinner = winningSeat === playerSeat;

    return (
        <div className="game-over-overlay">
            <div className="game-over-card">
                <h2>{isWinner ? 'You Win!' : 'You Lose'}</h2>
                <p>{isWinner ? 'Great game!' : 'Better luck next time.'}</p>
                <div className="game-over-buttons">
                    <button onClick={onPlayAgain}>Play Again</button>
                    <button className="secondary" onClick={onGoHome}>Back to Home</button>
                </div>
            </div>
        </div>
    );
}
