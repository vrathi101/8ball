/**
 * 8-Ball Pool - REST API Routes
 * Game creation, joining, and state fetching endpoints
 */

import { Express, Request, Response } from 'express';
import type { Database } from 'better-sqlite3';
import { GameService } from '../services/game.js';

export function setupRoutes(app: Express, db: Database): void {
    const gameService = new GameService(db);

    // Health check
    app.get('/api/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    /**
     * POST /api/games - Create a new game
     * Body: { displayName?: string }
     * Returns: { gameId, playerId, playerToken, joinLink, joinTokenP2 }
     */
    app.post('/api/games', (req: Request, res: Response) => {
        try {
            const displayName = req.body?.displayName || 'Player 1';
            const result = gameService.createGame(displayName);

            // Generate join link
            const host = req.get('host') || 'localhost:5173';
            const protocol = req.secure ? 'https' : 'http';
            const joinLink = `${protocol}://${host}/game/${result.gameId}?join=${result.joinTokenP2}`;

            res.status(201).json({
                gameId: result.gameId,
                playerId: result.playerId,
                playerToken: result.playerToken,
                joinLink,
                joinTokenP2: result.joinTokenP2,
            });
        } catch (error) {
            console.error('Error creating game:', error);
            res.status(500).json({ error: 'Failed to create game' });
        }
    });

    /**
     * POST /api/games/:id/join - Join an existing game
     * Body: { joinToken, displayName?: string }
     * Returns: { gameId, playerId, playerToken, seat }
     */
    app.post('/api/games/:id/join', (req: Request, res: Response) => {
        try {
            const gameId = req.params.id;
            const { joinToken, displayName } = req.body || {};

            if (!joinToken) {
                res.status(400).json({ error: 'Join token required' });
                return;
            }

            const result = gameService.joinGame(gameId, joinToken, displayName || 'Player 2');

            if (!result.success) {
                res.status(400).json({ error: result.error });
                return;
            }

            res.json({
                gameId,
                playerId: result.playerId,
                playerToken: result.playerToken,
                seat: result.seat,
            });
        } catch (error) {
            console.error('Error joining game:', error);
            res.status(500).json({ error: 'Failed to join game' });
        }
    });

    /**
     * GET /api/games/:id - Get game state
     * Headers: Authorization: Bearer <playerToken>
     * Returns: { gameId, status, version, tableState, players, yourSeat }
     */
    app.get('/api/games/:id', (req: Request, res: Response) => {
        try {
            const gameId = req.params.id;
            const authHeader = req.headers.authorization;

            if (!authHeader?.startsWith('Bearer ')) {
                res.status(401).json({ error: 'Authorization required' });
                return;
            }

            const playerToken = authHeader.slice(7);
            const auth = gameService.authenticatePlayer(gameId, playerToken);

            if (!auth.success) {
                res.status(401).json({ error: auth.error });
                return;
            }

            const state = gameService.getGameState(gameId, auth.seat!);

            if (!state) {
                res.status(404).json({ error: 'Game not found' });
                return;
            }

            res.json({
                gameId,
                status: state.game.status,
                version: state.game.version,
                tableState: state.tableState,
                players: state.players,
                yourSeat: auth.seat,
            });
        } catch (error) {
            console.error('Error fetching game:', error);
            res.status(500).json({ error: 'Failed to fetch game' });
        }
    });

    console.log('✅ Routes initialized');
}
