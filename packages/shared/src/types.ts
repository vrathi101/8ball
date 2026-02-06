/**
 * 8-Ball Pool - Shared Types
 * Core type definitions used by both client and server
 */

// ============================================
// Vector & Math Types
// ============================================

export interface Vec2 {
    x: number;
    y: number;
}

// ============================================
// Ball Types
// ============================================

export type BallId = 'cue' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';

export type BallGroup = 'SOLIDS' | 'STRIPES';

export interface BallState {
    id: BallId;
    pos: Vec2;
    vel: Vec2;
    inPlay: boolean;
}

// Ball number ranges
export const SOLID_BALLS: BallId[] = ['1', '2', '3', '4', '5', '6', '7', '8'];
export const STRIPE_BALLS: BallId[] = ['9', '10', '11', '12', '13', '14', '15'];

export function getBallGroup(ballId: BallId): BallGroup | null {
    if (ballId === 'cue' || ballId === '8') return null;
    const num = parseInt(ballId, 10);
    return num <= 7 ? 'SOLIDS' : 'STRIPES';
}

// ============================================
// Game State Types
// ============================================

export type GameStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'ABANDONED';

export type GamePhase =
    | 'AWAITING_BREAK'
    | 'AIMING'
    | 'SIMULATING'
    | 'BALL_IN_HAND'
    | 'FINISHED';

export type Seat = 1 | 2;

export interface GroupAssignments {
    seat1Group: BallGroup | null;
    seat2Group: BallGroup | null;
}

export interface TableState {
    balls: BallState[];
    pocketed: BallId[];
    groups: GroupAssignments;
    openTable: boolean;
    turnSeat: Seat;
    phase: GamePhase;
    ballInHand: boolean;
    ballInHandAnywhere: boolean; // true after break foul or scratch
    winningSeat: Seat | null;
    lastShotSummary: ShotSummary | null;
}

export interface ShotSummary {
    firstContact: BallId | null;
    pocketedBalls: BallId[];
    scratch: boolean;
    foul: FoulType | null;
    foulReason: string | null;
    turnChanged: boolean;
    gameOver: boolean;
    winner: Seat | null;
    pocketIndices?: Record<string, number>;
}

// ============================================
// Shot Types
// ============================================

export interface ShotParams {
    angle: number;      // radians, 0 = right, PI/2 = up
    power: number;      // 0..1
    spinX: number;      // -1..1 (side spin, left/right)
    spinY: number;      // -1..1 (top/back spin)
}

export interface BallPlacement {
    x: number;
    y: number;
}

// ============================================
// Foul Types
// ============================================

export type FoulType =
    | 'SCRATCH'           // Cue ball pocketed
    | 'WRONG_BALL_FIRST'  // Hit opponent's ball first
    | 'NO_RAIL'           // No ball hit rail after contact
    | 'NO_CONTACT'        // Didn't hit any ball
    | 'EARLY_8_POCKET'    // Pocketed 8 before clearing group
    | 'CUE_OFF_TABLE';    // Cue ball jumped off table

// ============================================
// Event Types (for event sourcing)
// ============================================

export type GameEventType =
    | 'GAME_CREATED'
    | 'PLAYER_JOINED'
    | 'GAME_STARTED'
    | 'SHOT_TAKEN'
    | 'BALL_POCKETED'
    | 'FOUL_COMMITTED'
    | 'GROUP_ASSIGNED'
    | 'TURN_CHANGED'
    | 'BALL_PLACED'
    | 'GAME_WON';

export interface GameEvent {
    id: string;
    gameId: string;
    seq: number;
    type: GameEventType;
    payload: Record<string, unknown>;
    createdAt: Date;
}

// ============================================
// API Types
// ============================================

export interface CreateGameResponse {
    gameId: string;
    playerId: string;
    playerToken: string;
    joinLink: string;
    joinTokenP2: string;
}

export interface JoinGameResponse {
    gameId: string;
    playerId: string;
    playerToken: string;
    seat: Seat;
}

export interface GameStateResponse {
    gameId: string;
    status: GameStatus;
    version: number;
    tableState: TableState;
    players: PlayerInfo[];
    yourSeat: Seat;
}

export interface PlayerInfo {
    seat: Seat;
    displayName: string;
    online: boolean;
}

// ============================================
// WebSocket Message Types
// ============================================

// Client -> Server
export interface WsClientAuth {
    type: 'auth';
    gameId: string;
    playerToken: string;
}

export interface WsClientRequestState {
    type: 'requestState';
    lastKnownSeq: number;
}

export interface WsClientSubmitShot {
    type: 'submitShot';
    gameVersion: number;
    shotParams: ShotParams;
}

export interface WsClientPlaceBall {
    type: 'placeBall';
    gameVersion: number;
    position: BallPlacement;
}

export type WsClientMessage =
    | WsClientAuth
    | WsClientRequestState
    | WsClientSubmitShot
    | WsClientPlaceBall;

// Server -> Client
export interface WsServerStateSync {
    type: 'stateSync';
    gameState: GameStateResponse;
    events: GameEvent[];
}

export interface WsServerShotResult {
    type: 'shotResult';
    keyframes: KeyFrame[];
    events: GameEvent[];
    newState: TableState;
    version: number;
}

export interface WsServerError {
    type: 'error';
    code: string;
    message: string;
}

export interface WsServerPresence {
    type: 'presence';
    seat: Seat;
    online: boolean;
}

export interface WsServerAuthSuccess {
    type: 'authSuccess';
    seat: Seat;
}

export type WsServerMessage =
    | WsServerStateSync
    | WsServerShotResult
    | WsServerError
    | WsServerPresence
    | WsServerAuthSuccess;

// ============================================
// Animation Types
// ============================================

export interface KeyFrame {
    time: number;  // ms from shot start
    balls: Array<{
        id: BallId;
        pos: Vec2;
        inPlay: boolean;
    }>;
}
