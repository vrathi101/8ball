/**
 * 8-Ball Pool - WebSocket Handlers
 * Placeholder for real-time communication
 */

import { Server } from 'socket.io';
import type { Database } from 'better-sqlite3';

export function setupSocketHandlers(io: Server, _db: Database): void {
    io.on('connection', (socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);

        socket.on('disconnect', () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);
        });

        // TODO: Implement socket handlers
        // - auth
        // - requestState
        // - submitShot
        // - placeBall
    });

    console.log('✅ Socket handlers initialized');
}
