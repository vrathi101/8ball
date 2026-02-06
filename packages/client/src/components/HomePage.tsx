import { useState } from 'react';
import { createGame } from '../utils/api';
import { saveCredentials, loadCredentials } from '../utils/credentials';

interface HomePageProps {
    onNavigate: (hash: string) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
    const [name, setName] = useState('');
    const [inviteLink, setInviteLink] = useState('');
    const [error, setError] = useState('');
    const [creating, setCreating] = useState(false);
    const existingCreds = loadCredentials();

    const handleCreate = async () => {
        if (!name.trim()) { setError('Enter your name'); return; }
        setCreating(true);
        setError('');
        try {
            const result = await createGame(name.trim());
            saveCredentials({
                gameId: result.gameId,
                playerToken: result.playerToken,
                playerSeat: 1,
                playerId: result.playerId,
            });
            const link = `${window.location.origin}/#/game/${result.gameId}?join=${result.joinTokenP2}`;
            setInviteLink(link);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to create game');
        } finally {
            setCreating(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(inviteLink);
    };

    const handleEnterGame = () => {
        const creds = loadCredentials();
        if (creds) onNavigate(`#/game/${creds.gameId}`);
    };

    return (
        <div className="home-page">
            <h1>8-Ball Pool</h1>
            {!inviteLink ? (
                <div className="home-form">
                    <input
                        type="text"
                        placeholder="Your name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                        maxLength={20}
                    />
                    <button onClick={handleCreate} disabled={creating}>
                        {creating ? 'Creating...' : 'Create Game'}
                    </button>
                    {existingCreds && (
                        <button className="secondary" onClick={() => onNavigate(`#/game/${existingCreds.gameId}`)}>
                            Resume Game
                        </button>
                    )}
                    {error && <div className="error-msg">{error}</div>}
                </div>
            ) : (
                <div className="invite-section">
                    <p>Share this link with your opponent:</p>
                    <div className="invite-link-box">
                        <input type="text" value={inviteLink} readOnly />
                        <button onClick={handleCopy}>Copy</button>
                    </div>
                    <button onClick={handleEnterGame}>Enter Game Room</button>
                </div>
            )}
        </div>
    );
}
