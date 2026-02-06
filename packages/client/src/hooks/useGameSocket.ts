/**
 * 8-Ball Pool - WebSocket Client Hook
 * Handles connection, authentication, and real-time game state updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
    WsServerStateSync,
    WsServerShotResult,
    WsServerError,
    WsServerPresence,
    WsServerAuthSuccess,
    TableState,
    Seat,
    ShotParams,
    KeyFrame,
} from '@8ball/shared';

interface GameState {
    gameId: string;
    status: string;
    version: number;
    tableState: TableState;
    yourSeat: Seat;
    players: Array<{ seat: Seat; displayName: string; online: boolean }>;
}

interface UseGameSocketOptions {
    serverUrl?: string;
    gameId: string;
    playerToken: string;
    onShotResult?: (keyframes: KeyFrame[], newState: TableState) => void;
    onError?: (error: string) => void;
}

interface UseGameSocketReturn {
    isConnected: boolean;
    isAuthenticated: boolean;
    gameState: GameState | null;
    mySeat: Seat | null;
    isMyTurn: boolean;
    error: string | null;
    submitShot: (params: ShotParams, gameVersion: number) => void;
    placeBall: (position: { x: number; y: number }, gameVersion: number) => void;
    reconnect: () => void;
}

export function useGameSocket({
    serverUrl = '',
    gameId,
    playerToken,
    onShotResult,
    onError,
}: UseGameSocketOptions): UseGameSocketReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [mySeat, setMySeat] = useState<Seat | null>(null);
    const [error, setError] = useState<string | null>(null);

    const socketRef = useRef<Socket | null>(null);

    // Connect to server
    const connect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.disconnect();
        }

        const socket = io(serverUrl, {
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('🔌 Connected to server');
            setIsConnected(true);
            setError(null);

            // Send auth message
            socket.emit('auth', {
                type: 'auth',
                gameId,
                playerToken,
            });
        });

        socket.on('disconnect', () => {
            console.log('🔌 Disconnected from server');
            setIsConnected(false);
            setIsAuthenticated(false);
        });

        socket.on('authSuccess', (data: WsServerAuthSuccess) => {
            console.log('✅ Authenticated as seat', data.seat);
            setIsAuthenticated(true);
            setMySeat(data.seat);
        });

        socket.on('stateSync', (data: WsServerStateSync) => {
            console.log('📦 State sync received, version:', data.gameState.version);
            setGameState(data.gameState);
        });

        socket.on('shotResult', (data: WsServerShotResult) => {
            console.log('🎱 Shot result received');
            setGameState(prev => prev ? {
                ...prev,
                version: data.version,
                tableState: data.newState,
            } : null);

            if (onShotResult) {
                onShotResult(data.keyframes, data.newState);
            }
        });

        socket.on('presence', (data: WsServerPresence) => {
            console.log(`👤 Player ${data.seat} is now ${data.online ? 'online' : 'offline'}`);
            setGameState(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    players: prev.players.map(p =>
                        p.seat === data.seat ? { ...p, online: data.online } : p
                    ),
                };
            });
        });

        socket.on('error', (data: WsServerError) => {
            console.error('❌ Error:', data.message);
            setError(data.message);
            if (onError) {
                onError(data.message);
            }
        });

        return socket;
    }, [serverUrl, gameId, playerToken, onShotResult, onError]);

    // Initialize connection
    useEffect(() => {
        const socket = connect();

        return () => {
            socket.disconnect();
        };
    }, [connect]);

    // Submit shot
    const submitShot = useCallback((params: ShotParams, gameVersion: number) => {
        if (!socketRef.current || !isAuthenticated) {
            console.warn('Cannot submit shot: not authenticated');
            return;
        }

        socketRef.current.emit('submitShot', {
            type: 'submitShot',
            gameVersion,
            shotParams: params,
        });
    }, [isAuthenticated]);

    // Place ball
    const placeBall = useCallback((position: { x: number; y: number }, gameVersion: number) => {
        if (!socketRef.current || !isAuthenticated) {
            console.warn('Cannot place ball: not authenticated');
            return;
        }

        socketRef.current.emit('placeBall', {
            type: 'placeBall',
            gameVersion,
            position,
        });
    }, [isAuthenticated]);

    // Manual reconnect
    const reconnect = useCallback(() => {
        connect();
    }, [connect]);

    // Compute if it's my turn
    const isMyTurn = gameState?.tableState.turnSeat === mySeat;

    return {
        isConnected,
        isAuthenticated,
        gameState,
        mySeat,
        isMyTurn,
        error,
        submitShot,
        placeBall,
        reconnect,
    };
}
