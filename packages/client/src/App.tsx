/**
 * 8-Ball Pool - Client App
 */

import { GamePage } from './components/GamePage';
import './index.css';

function App() {
    // For now, render the game page in development mode
    // Later this will be connected to WebSocket for multiplayer
    return (
        <div className="app">
            <GamePage
                isMyTurn={true}
                playerSeat={1}
            />
        </div>
    );
}

export default App;
