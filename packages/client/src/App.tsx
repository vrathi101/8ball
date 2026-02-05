/**
 * 8-Ball Pool - Main App Component
 */

import { useState, useEffect } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { createInitialTableState, TableState } from '@8ball/shared';

function App() {
    const [tableState, setTableState] = useState<TableState | null>(null);

    useEffect(() => {
        // Initialize with default table state for development
        setTableState(createInitialTableState());
    }, []);

    return (
        <div className="app">
            <header className="header">
                <h1>🎱 8-Ball Pool</h1>
                <p className="subtitle">Private 2-Player Games</p>
            </header>

            <main className="main">
                {tableState ? (
                    <GameCanvas tableState={tableState} />
                ) : (
                    <div className="loading">Loading...</div>
                )}
            </main>

            <footer className="footer">
                <p>MVP Development</p>
            </footer>
        </div>
    );
}

export default App;
