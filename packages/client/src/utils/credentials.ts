import type { Seat } from '@8ball/shared';

const STORAGE_KEY = '8ball_credentials';

export interface GameCredentials {
    gameId: string;
    playerToken: string;
    playerSeat: Seat;
    playerId: string;
}

export function saveCredentials(creds: GameCredentials): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

export function loadCredentials(): GameCredentials | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as GameCredentials;
    } catch {
        return null;
    }
}

export function clearCredentials(): void {
    localStorage.removeItem(STORAGE_KEY);
}
