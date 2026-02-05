/**
 * 8-Ball Pool - WebSocket Handlers
 * Real-time game communication with auth and state sync
 */

import { Server, Socket } from 'socket.io';
import type { Database } from 'better-sqlite3';
import { GameService } from '../services/game.js';
import type {
    WsClientMessage,
    WsServerStateSync,
    WsServerError,
    WsServerPresence,
    WsServerAuthSuccess,
    Seat,
} from '@8ball/shared';

interface AuthenticatedSocket extends Socket {
    gameId?: string;
    seat?: Seat;
    playerId?: string;
}

// Track online players per game
const onlinePlayers = new Map<string, Set<Seat>>();

export function setupSocketHandlers(io: Server, db: Database): void {
    const gameService = new GameService(db);

    io.on('connection', (socket: AuthenticatedSocket) => {
        console.log(`🔌 Client connected: ${socket.id}`);

        // Handle authentication
        socket.on('auth', async (data: WsClientMessage) => {
            if (data.type !== 'auth') return;

            const { gameId, playerToken } = data;
            const auth = gameService.authenticatePlayer(gameId, playerToken);

            if (!auth.success) {
                const error: WsServerError = {
                    type: 'error',
                    code: 'AUTH_FAILED',
                    message: auth.error || 'Authentication failed',
                };
                socket.emit('error', error);
                socket.disconnect();
                return;
            }

            // Store auth info on socket
            socket.gameId = gameId;
            socket.seat = auth.seat;
            socket.playerId = auth.playerId;

            // Join game room
            socket.join(gameId);

            // Track online status
            if (!onlinePlayers.has(gameId)) {
                onlinePlayers.set(gameId, new Set());
            }
            onlinePlayers.get(gameId)!.add(auth.seat!);

            // Send auth success
            const authSuccess: WsServerAuthSuccess = {
                type: 'authSuccess',
                seat: auth.seat!,
            };
            socket.emit('authSuccess', authSuccess);

            // Broadcast presence
            const presence: WsServerPresence = {
                type: 'presence',
                seat: auth.seat!,
                online: true,
            };
            socket.to(gameId).emit('presence', presence);

            // Send current game state
            sendGameState(socket, gameService, gameId, auth.seat!);

            console.log(`✅ Player ${auth.seat} authenticated for game ${gameId.slice(0, 8)}...`);
        });

        // Handle state request (for reconnection)
        socket.on('requestState', (data: WsClientMessage) => {
            if (data.type !== 'requestState') return;
            if (!socket.gameId || !socket.seat) {
                socket.emit('error', { type: 'error', code: 'NOT_AUTHENTICATED', message: 'Not authenticated' });
                return;
            }

            sendGameState(socket, gameService, socket.gameId, socket.seat, data.lastKnownSeq);
        });

        // Handle shot submission (placeholder - physics engine will be added later)
        socket.on('submitShot', (data: WsClientMessage) => {
            if (data.type !== 'submitShot') return;
            if (!socket.gameId || !socket.seat) {
                socket.emit('error', { type: 'error', code: 'NOT_AUTHENTICATED', message: 'Not authenticated' });
                return;
            }

            const { gameVersion, shotParams } = data;

            // Verify it's player's turn
            const state = gameService.getGameState(socket.gameId, socket.seat);
            if (!state) {
                socket.emit('error', { type: 'error', code: 'GAME_NOT_FOUND', message: 'Game not found' });
                return;
            }

            if (state.tableState.turnSeat !== socket.seat) {
                socket.emit('error', { type: 'error', code: 'NOT_YOUR_TURN', message: 'Not your turn' });
                return;
            }

            // Check version for optimistic concurrency
            if (state.game.version !== gameVersion) {
                // Send current state so client can retry
                sendGameState(socket, gameService, socket.gameId, socket.seat);
                return;
            }

            // TODO: Run physics simulation and rules engine
            // For now, just acknowledge the shot
            console.log(`🎱 Shot received from seat ${socket.seat}:`, shotParams);

            // Placeholder: In Phase 4, this will call the physics engine
            socket.emit('error', {
                type: 'error',
                code: 'NOT_IMPLEMENTED',
                message: 'Physics engine not yet implemented'
            });
        });

        // Handle ball placement
        socket.on('placeBall', (data: WsClientMessage) => {
            if (data.type !== 'placeBall') return;
            if (!socket.gameId || !socket.seat) {
                socket.emit('error', { type: 'error', code: 'NOT_AUTHENTICATED', message: 'Not authenticated' });
                return;
            }

            const { gameVersion, position } = data;

            // Verify state allows ball placement
            const state = gameService.getGameState(socket.gameId, socket.seat);
            if (!state) {
                socket.emit('error', { type: 'error', code: 'GAME_NOT_FOUND', message: 'Game not found' });
                return;
            }

            if (!state.tableState.ballInHand) {
                socket.emit('error', { type: 'error', code: 'INVALID_ACTION', message: 'Ball not in hand' });
                return;
            }

            if (state.tableState.turnSeat !== socket.seat) {
                socket.emit('error', { type: 'error', code: 'NOT_YOUR_TURN', message: 'Not your turn' });
                return;
            }

            if (state.game.version !== gameVersion) {
                sendGameState(socket, gameService, socket.gameId, socket.seat);
                return;
            }

            console.log(`🎱 Ball placement from seat ${socket.seat}:`, position);

            // TODO: Validate placement and update state
            socket.emit('error', {
                type: 'error',
                code: 'NOT_IMPLEMENTED',
                message: 'Ball placement not yet implemented'
            });
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);

            if (socket.gameId && socket.seat) {
                // Update online status
                const players = onlinePlayers.get(socket.gameId);
                if (players) {
                    players.delete(socket.seat);
                    if (players.size === 0) {
                        onlinePlayers.delete(socket.gameId);
                    }
                }

                // Broadcast offline status
                const presence: WsServerPresence = {
                    type: 'presence',
                    seat: socket.seat,
                    online: false,
                };
                socket.to(socket.gameId).emit('presence', presence);
            }
        });
    });

    console.log('✅ Socket handlers initialized');
}

/**
 * Send current game state to a socket
 */
function sendGameState(
    socket: AuthenticatedSocket,
    gameService: GameService,
    gameId: string,
    seat: Seat,
    sinceSeq?: number
): void {
    const state = gameService.getGameState(gameId, seat);
    if (!state) {
        socket.emit('error', { type: 'error', code: 'GAME_NOT_FOUND', message: 'Game not found' });
        return;
    }

    // Get events since last known sequence
    const events = gameService.getEventsSince(gameId, sinceSeq ?? 0);

    // Update online status in player list
    const onlineSeats = onlinePlayers.get(gameId) || new Set();
    const players = state.players.map(p => ({
        ...p,
        online: onlineSeats.has(p.seat),
    }));

    const stateSync: WsServerStateSync = {
        type: 'stateSync',
        gameState: {
            gameId,
            status: state.game.status,
            version: state.game.version,
            tableState: state.tableState,
            players,
            yourSeat: seat,
        },
        events: events.map(e => ({
            id: '',
            gameId,
            seq: e.seq,
            type: e.type as WsServerStateSync['events'][0]['type'],
            payload: e.payload,
            createdAt: new Date(e.created_at),
        })),
    };

    socket.emit('stateSync', stateSync);
}

/**
 * Get online players for a game (exported for use by other modules)
 */
export function getOnlinePlayers(gameId: string): Set<Seat> {
    return onlinePlayers.get(gameId) || new Set();
}
