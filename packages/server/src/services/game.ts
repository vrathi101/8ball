/**
 * 8-Ball Pool - Game Service
 * Core business logic for game creation, joining, and state management
 */

import type { Database } from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import {
    generateId,
    generateToken,
    createInitialTableState,
    TableState,
    GameStatus,
    Seat,
} from '@8ball/shared';

export interface GameRecord {
    id: string;
    status: GameStatus;
    created_at: string;
    updated_at: string;
    current_turn_seat: Seat;
    version: number;
    break_seat: Seat;
    winner_seat: Seat | null;
    join_token_p2: string;
    join_token_used: number;
}

export interface PlayerRecord {
    id: string;
    game_id: string;
    seat: Seat;
    display_name: string;
    player_token_hash: string;
    created_at: string;
    last_seen_at: string | null;
}

export interface SnapshotRecord {
    game_id: string;
    version: number;
    state_json: string;
    created_at: string;
}

export class GameService {
    constructor(private db: Database) { }

    /**
     * Create a new game
     * Returns game info and player1's credentials
     */
    createGame(displayName: string = 'Player 1'): {
        gameId: string;
        playerId: string;
        playerToken: string;
        joinTokenP2: string;
    } {
        const gameId = generateId();
        const playerId = generateId();
        const playerToken = generateToken();
        const joinTokenP2 = generateToken();
        const playerTokenHash = bcrypt.hashSync(playerToken, 10);

        // Create game
        this.db.prepare(`
      INSERT INTO games (id, status, current_turn_seat, break_seat, join_token_p2)
      VALUES (?, 'WAITING', 1, 1, ?)
    `).run(gameId, joinTokenP2);

        // Create player 1
        this.db.prepare(`
      INSERT INTO game_players (id, game_id, seat, display_name, player_token_hash)
      VALUES (?, ?, 1, ?, ?)
    `).run(playerId, gameId, displayName, playerTokenHash);

        // Create initial snapshot
        const initialState = createInitialTableState();
        this.db.prepare(`
      INSERT INTO game_snapshots (game_id, version, state_json)
      VALUES (?, 0, ?)
    `).run(gameId, JSON.stringify(initialState));

        // Log game created event
        this.logEvent(gameId, 'GAME_CREATED', { creatorSeat: 1 });

        return { gameId, playerId, playerToken, joinTokenP2 };
    }

    /**
     * Join an existing game using the join token
     */
    joinGame(gameId: string, joinToken: string, displayName: string = 'Player 2'): {
        success: boolean;
        error?: string;
        playerId?: string;
        playerToken?: string;
        seat?: Seat;
    } {
        // Get game
        const game = this.db.prepare(`
      SELECT * FROM games WHERE id = ?
    `).get(gameId) as GameRecord | undefined;

        if (!game) {
            return { success: false, error: 'Game not found' };
        }

        if (game.status !== 'WAITING') {
            return { success: false, error: 'Game already started or finished' };
        }

        if (game.join_token_used) {
            return { success: false, error: 'Join link already used' };
        }

        if (game.join_token_p2 !== joinToken) {
            return { success: false, error: 'Invalid join token' };
        }

        // Create player 2
        const playerId = generateId();
        const playerToken = generateToken();
        const playerTokenHash = bcrypt.hashSync(playerToken, 10);

        // Transaction: add player and update game
        const transaction = this.db.transaction(() => {
            // Mark join token as used and start game
            this.db.prepare(`
        UPDATE games 
        SET join_token_used = 1, status = 'IN_PROGRESS', updated_at = datetime('now')
        WHERE id = ?
      `).run(gameId);

            // Create player 2
            this.db.prepare(`
        INSERT INTO game_players (id, game_id, seat, display_name, player_token_hash)
        VALUES (?, ?, 2, ?, ?)
      `).run(playerId, gameId, displayName, playerTokenHash);

            // Log events
            this.logEvent(gameId, 'PLAYER_JOINED', { seat: 2 });
            this.logEvent(gameId, 'GAME_STARTED', {});
        });

        transaction();

        return { success: true, playerId, playerToken, seat: 2 };
    }

    /**
     * Authenticate a player and return their seat
     */
    authenticatePlayer(gameId: string, playerToken: string): {
        success: boolean;
        seat?: Seat;
        playerId?: string;
        error?: string;
    } {
        const players = this.db.prepare(`
      SELECT * FROM game_players WHERE game_id = ?
    `).all(gameId) as PlayerRecord[];

        for (const player of players) {
            if (bcrypt.compareSync(playerToken, player.player_token_hash)) {
                // Update last seen
                this.db.prepare(`
          UPDATE game_players SET last_seen_at = datetime('now') WHERE id = ?
        `).run(player.id);

                return { success: true, seat: player.seat as Seat, playerId: player.id };
            }
        }

        return { success: false, error: 'Invalid credentials' };
    }

    /**
     * Get full game state for a player
     */
    getGameState(gameId: string, _playerSeat: Seat): {
        game: GameRecord;
        tableState: TableState;
        players: Array<{ seat: Seat; displayName: string; online: boolean }>;
    } | null {
        const game = this.db.prepare(`
      SELECT * FROM games WHERE id = ?
    `).get(gameId) as GameRecord | undefined;

        if (!game) return null;

        // Get latest snapshot
        const snapshot = this.db.prepare(`
      SELECT * FROM game_snapshots 
      WHERE game_id = ? 
      ORDER BY version DESC 
      LIMIT 1
    `).get(gameId) as SnapshotRecord | undefined;

        if (!snapshot) return null;

        // Get players
        const playerRecords = this.db.prepare(`
      SELECT * FROM game_players WHERE game_id = ?
    `).all(gameId) as PlayerRecord[];

        const players = playerRecords.map(p => ({
            seat: p.seat as Seat,
            displayName: p.display_name,
            online: false, // Will be updated by socket handler
        }));

        return {
            game,
            tableState: JSON.parse(snapshot.state_json) as TableState,
            players,
        };
    }

    /**
     * Save a new game snapshot
     */
    saveSnapshot(gameId: string, version: number, state: TableState): void {
        this.db.prepare(`
      INSERT INTO game_snapshots (game_id, version, state_json)
      VALUES (?, ?, ?)
    `).run(gameId, version, JSON.stringify(state));
    }

    /**
     * Update game version and turn
     */
    updateGame(gameId: string, updates: Partial<{
        version: number;
        current_turn_seat: Seat;
        status: GameStatus;
        winner_seat: Seat;
    }>): void {
        const setClauses: string[] = ['updated_at = datetime(\'now\')'];
        const values: unknown[] = [];

        if (updates.version !== undefined) {
            setClauses.push('version = ?');
            values.push(updates.version);
        }
        if (updates.current_turn_seat !== undefined) {
            setClauses.push('current_turn_seat = ?');
            values.push(updates.current_turn_seat);
        }
        if (updates.status !== undefined) {
            setClauses.push('status = ?');
            values.push(updates.status);
        }
        if (updates.winner_seat !== undefined) {
            setClauses.push('winner_seat = ?');
            values.push(updates.winner_seat);
        }

        values.push(gameId);

        this.db.prepare(`
      UPDATE games SET ${setClauses.join(', ')} WHERE id = ?
    `).run(...values);
    }

    /**
     * Get current game version (for optimistic concurrency)
     */
    getGameVersion(gameId: string): number | null {
        const game = this.db.prepare(`
      SELECT version FROM games WHERE id = ?
    `).get(gameId) as { version: number } | undefined;

        return game?.version ?? null;
    }

    /**
     * Log a game event
     */
    logEvent(gameId: string, type: string, payload: Record<string, unknown>): void {
        const id = generateId();
        const seq = this.getNextEventSeq(gameId);

        this.db.prepare(`
      INSERT INTO game_events (id, game_id, seq, type, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, gameId, seq, type, JSON.stringify(payload));
    }

    /**
     * Get next event sequence number
     */
    private getNextEventSeq(gameId: string): number {
        const result = this.db.prepare(`
      SELECT MAX(seq) as max_seq FROM game_events WHERE game_id = ?
    `).get(gameId) as { max_seq: number | null };

        return (result?.max_seq ?? 0) + 1;
    }

    /**
     * Get events since a sequence number
     */
    getEventsSince(gameId: string, sinceSeq: number): Array<{
        seq: number;
        type: string;
        payload: Record<string, unknown>;
        created_at: string;
    }> {
        const events = this.db.prepare(`
      SELECT seq, type, payload_json, created_at 
      FROM game_events 
      WHERE game_id = ? AND seq > ?
      ORDER BY seq ASC
    `).all(gameId, sinceSeq) as Array<{
            seq: number;
            type: string;
            payload_json: string;
            created_at: string;
        }>;

        return events.map(e => ({
            seq: e.seq,
            type: e.type,
            payload: JSON.parse(e.payload_json),
            created_at: e.created_at,
        }));
    }
}
