import { useState } from 'react';
import { joinGame } from '../utils/api';
import { saveCredentials } from '../utils/credentials';
import type { Seat } from '@8ball/shared';

interface JoinPageProps {
    gameId: string;
    joinToken: string;
    onNavigate: (hash: string) => void;
}

export function JoinPage({ gameId, joinToken, onNavigate }: JoinPageProps) {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [joining, setJoining] = useState(false);

    const handleJoin = async () => {
        if (!name.trim()) { setError('Enter your name'); return; }
        setJoining(true);
        setError('');
        try {
            const result = await joinGame(gameId, joinToken, name.trim());
            saveCredentials({
                gameId: result.gameId,
                playerToken: result.playerToken,
                playerSeat: result.seat as Seat,
                playerId: result.playerId,
            });
            onNavigate(`#/game/${gameId}`);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to join game');
        } finally {
            setJoining(false);
        }
    };

    return (
        <div className="home-page">
            <h1>8-Ball Pool</h1>
            <p>You've been invited to a game!</p>
            <div className="home-form">
                <input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                    maxLength={20}
                />
                <button onClick={handleJoin} disabled={joining}>
                    {joining ? 'Joining...' : 'Join Game'}
                </button>
                {error && <div className="error-msg">{error}</div>}
            </div>
        </div>
    );
}
