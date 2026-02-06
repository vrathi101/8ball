import { useState, useEffect, useCallback } from 'react';
import { GamePage } from './components/GamePage';
import { HomePage } from './components/HomePage';
import { JoinPage } from './components/JoinPage';
import { GameRoom } from './components/GameRoom';
import { loadCredentials } from './utils/credentials';
import './index.css';

function parseHash(): { path: string; params: URLSearchParams } {
    const hash = window.location.hash.slice(1) || '/';
    const [path, query] = hash.split('?');
    return { path, params: new URLSearchParams(query || '') };
}

function App() {
    const [route, setRoute] = useState(parseHash);

    const navigate = useCallback((hash: string) => {
        window.location.hash = hash;
    }, []);

    useEffect(() => {
        const onHashChange = () => setRoute(parseHash());
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    // On initial load with no hash, check for existing credentials
    useEffect(() => {
        if (route.path === '/') {
            const creds = loadCredentials();
            if (creds && !window.location.hash) {
                // Don't auto-redirect; let user choose from home page
            }
        }
    }, []);

    const { path, params } = route;

    // #/dev -> dev mode
    if (path === '/dev') {
        return (
            <div className="app">
                <GamePage isMyTurn={true} playerSeat={1} />
            </div>
        );
    }

    // #/game/:gameId?join=TOKEN
    const gameMatch = path.match(/^\/game\/([a-f0-9-]+)$/i);
    if (gameMatch) {
        const gameId = gameMatch[1];
        const joinToken = params.get('join');
        if (joinToken) {
            return (
                <div className="app">
                    <JoinPage gameId={gameId} joinToken={joinToken} onNavigate={navigate} />
                </div>
            );
        }
        return (
            <div className="app">
                <GameRoom gameId={gameId} onNavigate={navigate} />
            </div>
        );
    }

    // Default: home page
    return (
        <div className="app">
            <HomePage onNavigate={navigate} />
        </div>
    );
}

export default App;
