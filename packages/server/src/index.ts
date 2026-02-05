/**
 * 8-Ball Pool Server - Entry Point
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { initDatabase } from './db/index.js';
import { setupRoutes } from './routes/index.js';
import { setupSocketHandlers } from './socket/index.js';

const PORT = process.env.PORT || 3001;

async function main() {
    // Initialize database
    const db = initDatabase();

    // Create Express app
    const app = express();
    app.use(cors());
    app.use(express.json());

    // Setup REST routes
    setupRoutes(app, db);

    // Create HTTP server
    const httpServer = createServer(app);

    // Setup Socket.IO
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || 'http://localhost:5173',
            methods: ['GET', 'POST'],
        },
    });

    // Setup WebSocket handlers
    setupSocketHandlers(io, db);

    // Start server
    httpServer.listen(PORT, () => {
        console.log(`🎱 8-Ball Server running on http://localhost:${PORT}`);
    });
}

main().catch(console.error);
