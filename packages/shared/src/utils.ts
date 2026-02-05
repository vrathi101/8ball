/**
 * 8-Ball Pool - Shared Utilities
 * Helper functions used by both client and server
 */

import { Vec2, BallState, BallId, TableState, Seat, BallGroup } from './types.js';
import { TABLE, PHYSICS } from './constants.js';

// ============================================
// Vector Math
// ============================================

export function vec2(x: number, y: number): Vec2 {
    return { x, y };
}

export function vec2Add(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x + b.x, y: a.y + b.y };
}

export function vec2Sub(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x - b.x, y: a.y - b.y };
}

export function vec2Scale(v: Vec2, s: number): Vec2 {
    return { x: v.x * s, y: v.y * s };
}

export function vec2Length(v: Vec2): number {
    return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vec2LengthSq(v: Vec2): number {
    return v.x * v.x + v.y * v.y;
}

export function vec2Normalize(v: Vec2): Vec2 {
    const len = vec2Length(v);
    if (len === 0) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
}

export function vec2Dot(a: Vec2, b: Vec2): number {
    return a.x * b.x + a.y * b.y;
}

export function vec2Distance(a: Vec2, b: Vec2): number {
    return vec2Length(vec2Sub(a, b));
}

// ============================================
// Ball Helpers
// ============================================

export function createBall(id: BallId, x: number, y: number): BallState {
    return {
        id,
        pos: { x, y },
        vel: { x: 0, y: 0 },
        inPlay: true,
    };
}

export function isBallMoving(ball: BallState): boolean {
    return vec2LengthSq(ball.vel) > PHYSICS.MIN_VELOCITY * PHYSICS.MIN_VELOCITY;
}

export function areAllBallsStopped(balls: BallState[]): boolean {
    return balls.filter(b => b.inPlay).every(b => !isBallMoving(b));
}

// ============================================
// Rack Generation
// ============================================

/**
 * Generate the initial rack for 8-ball
 * Standard diamond rack with 8-ball in center
 */
export function generateRack(): BallState[] {
    const balls: BallState[] = [];
    const r = TABLE.BALL_RADIUS;
    const footX = TABLE.FOOT_SPOT_X;
    const footY = TABLE.HEIGHT / 2;

    // Cue ball at head position
    balls.push(createBall('cue', TABLE.HEAD_STRING_X, TABLE.HEIGHT / 2));

    // Rack positions (5 rows of diamond)
    // Row 0 (apex): 1 ball
    // Row 1: 2 balls
    // Row 2: 3 balls (8-ball in center)
    // Row 3: 4 balls
    // Row 4: 5 balls

    const rowSpacing = r * 2 * Math.cos(Math.PI / 6); // Horizontal spacing between rows
    const colSpacing = r * 2;

    // Ball arrangement (WPA standard: 8 in center, one solid and one stripe in back corners)
    // For simplicity, we'll use a fixed but valid arrangement
    const rackOrder: BallId[] = [
        '1',                          // Row 0 (apex) - must be solid or stripe
        '9', '2',                     // Row 1
        '3', '8', '10',               // Row 2 (8 in center)
        '11', '4', '5', '12',         // Row 3
        '6', '13', '14', '7', '15',   // Row 4 (corners must be different groups)
    ];

    let ballIndex = 0;
    for (let row = 0; row < 5; row++) {
        const ballsInRow = row + 1;
        const rowX = footX + row * rowSpacing;
        const startY = footY - (ballsInRow - 1) * colSpacing / 2;

        for (let col = 0; col < ballsInRow; col++) {
            const y = startY + col * colSpacing;
            const id = rackOrder[ballIndex];
            balls.push(createBall(id, rowX, y));
            ballIndex++;
        }
    }

    return balls;
}

// ============================================
// Initial Game State
// ============================================

export function createInitialTableState(): TableState {
    return {
        balls: generateRack(),
        pocketed: [],
        groups: {
            seat1Group: null,
            seat2Group: null,
        },
        openTable: true,
        turnSeat: 1,  // Seat 1 breaks
        phase: 'AWAITING_BREAK',
        ballInHand: false,
        ballInHandAnywhere: false,
        winningSeat: null,
        lastShotSummary: null,
    };
}

// ============================================
// Group Helpers
// ============================================

export function getOpponentSeat(seat: Seat): Seat {
    return seat === 1 ? 2 : 1;
}

export function getOpponentGroup(group: BallGroup): BallGroup {
    return group === 'SOLIDS' ? 'STRIPES' : 'SOLIDS';
}

export function getPlayerGroup(state: TableState, seat: Seat): BallGroup | null {
    return seat === 1 ? state.groups.seat1Group : state.groups.seat2Group;
}

export function getRemainingBalls(state: TableState, group: BallGroup): BallId[] {
    return state.balls
        .filter(b => b.inPlay && b.id !== 'cue' && b.id !== '8')
        .filter(b => {
            const num = parseInt(b.id, 10);
            return group === 'SOLIDS' ? num <= 7 : num >= 9;
        })
        .map(b => b.id);
}

export function isGroupCleared(state: TableState, group: BallGroup): boolean {
    return getRemainingBalls(state, group).length === 0;
}

// ============================================
// ID Generation
// ============================================

export function generateId(): string {
    return crypto.randomUUID();
}

export function generateToken(): string {
    // Generate a secure random token (32 bytes = 256 bits)
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
