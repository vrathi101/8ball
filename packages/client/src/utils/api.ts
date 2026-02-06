import type { CreateGameResponse, JoinGameResponse, GameStateResponse } from '@8ball/shared';

export async function createGame(displayName: string): Promise<CreateGameResponse> {
    const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to create game');
    return res.json();
}

export async function joinGame(gameId: string, joinToken: string, displayName: string): Promise<JoinGameResponse> {
    const res = await fetch(`/api/games/${gameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinToken, displayName }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to join game');
    return res.json();
}

export async function getGameState(gameId: string, playerToken: string): Promise<GameStateResponse> {
    const res = await fetch(`/api/games/${gameId}`, {
        headers: { Authorization: `Bearer ${playerToken}` },
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to get game state');
    return res.json();
}
