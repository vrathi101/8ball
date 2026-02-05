/**
 * 8-Ball Pool - REST API Routes
 * Placeholder for game creation, joining, and state fetching
 */

import { Express } from 'express';
import type { Database } from 'better-sqlite3';

export function setupRoutes(app: Express, _db: Database): void {
    // Health check
    app.get('/api/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // TODO: Implement game routes
    // POST /api/games - Create game
    // POST /api/games/:id/join - Join game
    // GET /api/games/:id - Get game state

    console.log('✅ Routes initialized');
}
