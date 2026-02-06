/**
 * 8-Ball Pool - Physics Engine
 * Server-side deterministic physics simulation for billiards
 */

import {
    Vec2,
    BallId,
    TableState,
    ShotParams,
    KeyFrame,
    ShotSummary,
    FoulType,
} from './types.js';
import {
    vec2,
    vec2Add,
    vec2Sub,
    vec2Scale,
    vec2LengthSq,
    vec2Normalize,
    vec2Dot,
    vec2Distance,
    vec2Length,
    isGroupCleared,
} from './utils.js';
import { TABLE, POCKETS, PHYSICS } from './constants.js';

// ============================================
// Physics Simulation Result
// ============================================

export interface SimulationResult {
    finalState: TableState;
    keyframes: KeyFrame[];
    summary: ShotSummary;
}

// ============================================
// Internal Simulation State
// ============================================

interface SimBall {
    id: BallId;
    pos: Vec2;
    vel: Vec2;
    inPlay: boolean;
    spin: Vec2;       // spin X (side) and Y (follow/draw)
    hasHitBall: boolean; // whether cue ball has made first contact
}

// Minimum velocity to count a cushion hit as a real rail contact
const MIN_RAIL_VELOCITY = 0.1;

// Spin effect strengths
const SPIN_FOLLOW_DRAW = 0.35;  // how much follow/draw affects velocity after contact
const SPIN_SIDE_CUSHION = 0.25; // how much side spin deflects on cushion rebound

// ============================================
// Main Simulation Function
// ============================================

export function simulateShot(
    tableState: TableState,
    shotParams: ShotParams
): SimulationResult {
    // Deep clone the balls for simulation
    const balls: SimBall[] = tableState.balls.map(b => ({
        id: b.id,
        pos: { x: b.pos.x, y: b.pos.y },
        vel: { x: 0, y: 0 },
        inPlay: b.inPlay,
        spin: { x: 0, y: 0 },
        hasHitBall: false,
    }));

    // Find cue ball and apply initial velocity
    const cueBall = balls.find(b => b.id === 'cue');
    if (!cueBall || !cueBall.inPlay) {
        throw new Error('Cue ball not in play');
    }

    // Calculate initial velocity from shot params
    const speed = shotParams.power * PHYSICS.POWER_TO_VELOCITY;
    cueBall.vel = {
        x: Math.cos(shotParams.angle) * speed,
        y: Math.sin(shotParams.angle) * speed,
    };

    // Initialize cue ball spin from shot params
    cueBall.spin = {
        x: shotParams.spinX || 0,
        y: shotParams.spinY || 0,
    };

    // Track events during simulation
    const pocketedBalls: BallId[] = [];
    const pocketIndices: Map<BallId, number> = new Map();
    let firstContact: BallId | null = null;
    let scratch = false;
    let railAfterContact = false;

    // Keyframes for animation
    const keyframes: KeyFrame[] = [];
    let lastKeyframeTime = 0;

    // Fixed timestep simulation
    let time = 0;
    let settledFrames = 0;
    const dt = PHYSICS.TIME_STEP;

    for (let frame = 0; frame < PHYSICS.MAX_FRAMES; frame++) {
        time = frame * dt;

        // Check if all balls have settled
        const allStopped = balls.filter(b => b.inPlay).every(b =>
            vec2LengthSq(b.vel) < PHYSICS.MIN_VELOCITY * PHYSICS.MIN_VELOCITY
        );

        if (allStopped) {
            settledFrames++;
            if (settledFrames >= PHYSICS.SETTLE_FRAMES) {
                break;
            }
        } else {
            settledFrames = 0;
        }

        // Record keyframe at intervals
        if ((time - lastKeyframeTime) * 1000 >= PHYSICS.KEYFRAME_INTERVAL) {
            keyframes.push(createKeyframe(time * 1000, balls));
            lastKeyframeTime = time;
        }

        // Integrate positions
        for (const ball of balls) {
            if (!ball.inPlay) continue;

            // Update position
            ball.pos = vec2Add(ball.pos, vec2Scale(ball.vel, dt));

            // Apply friction
            ball.vel = vec2Scale(ball.vel, PHYSICS.FRICTION);

            // Stop very slow balls
            if (vec2LengthSq(ball.vel) < PHYSICS.MIN_VELOCITY * PHYSICS.MIN_VELOCITY) {
                ball.vel = vec2(0, 0);
            }
        }

        // Handle ball-ball collisions
        for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
                const b1 = balls[i];
                const b2 = balls[j];

                if (!b1.inPlay || !b2.inPlay) continue;

                const collision = checkBallBallCollision(b1, b2);
                if (collision) {
                    resolveBallBallCollision(b1, b2);

                    // Track first contact (for fouls)
                    if (firstContact === null) {
                        if (b1.id === 'cue') {
                            firstContact = b2.id;
                        } else if (b2.id === 'cue') {
                            firstContact = b1.id;
                        }
                    }

                    // Apply follow/draw spin on cue ball's first contact
                    if (b1.id === 'cue' && !b1.hasHitBall) {
                        b1.hasHitBall = true;
                        applyFollowDrawSpin(b1);
                    } else if (b2.id === 'cue' && !b2.hasHitBall) {
                        b2.hasHitBall = true;
                        applyFollowDrawSpin(b2);
                    }
                }
            }
        }

        // Handle ball-cushion collisions
        for (const ball of balls) {
            if (!ball.inPlay) continue;

            const cushionHit = handleCushionCollision(ball);
            if (cushionHit) {
                // Only count as rail contact if ball has meaningful velocity
                if (vec2Length(ball.vel) > MIN_RAIL_VELOCITY && firstContact !== null) {
                    railAfterContact = true;
                }
            }
        }

        // Handle ball-pocket detection
        for (const ball of balls) {
            if (!ball.inPlay) continue;

            const pocketIdx = getBallPocketIndex(ball.pos);
            if (pocketIdx >= 0) {
                ball.inPlay = false;
                pocketedBalls.push(ball.id);
                pocketIndices.set(ball.id, pocketIdx);

                if (ball.id === 'cue') {
                    scratch = true;
                }
            }
        }
    }

    // Add final keyframe
    keyframes.push(createKeyframe(time * 1000, balls));

    // Build final table state
    const finalState = buildFinalState(tableState, balls, pocketedBalls);

    // Build shot summary
    const summary = buildShotSummary(
        tableState,
        finalState,
        firstContact,
        pocketedBalls,
        scratch,
        railAfterContact,
        pocketIndices
    );

    return {
        finalState,
        keyframes,
        summary,
    };
}

// ============================================
// Spin Physics
// ============================================

function applyFollowDrawSpin(cueBall: SimBall): void {
    const spinY = cueBall.spin.y;
    if (Math.abs(spinY) < 0.01) return;

    const speed = vec2Length(cueBall.vel);
    if (speed < 0.01) return;

    const dir = vec2Normalize(cueBall.vel);

    // spinY > 0 = top spin (follow): add velocity in travel direction
    // spinY < 0 = back spin (draw): subtract velocity (pull back)
    const adjustment = speed * spinY * SPIN_FOLLOW_DRAW;
    cueBall.vel = vec2Add(cueBall.vel, vec2Scale(dir, adjustment));
}

// ============================================
// Collision Detection & Resolution
// ============================================

function checkBallBallCollision(b1: SimBall, b2: SimBall): boolean {
    const dist = vec2Distance(b1.pos, b2.pos);
    const minDist = TABLE.BALL_RADIUS * 2;
    return dist < minDist;
}

function resolveBallBallCollision(b1: SimBall, b2: SimBall): void {
    const normal = vec2Normalize(vec2Sub(b2.pos, b1.pos));
    const relVel = vec2Sub(b1.vel, b2.vel);
    const velAlongNormal = vec2Dot(relVel, normal);

    // Don't resolve if balls are moving apart
    if (velAlongNormal < 0) return;

    // Calculate impulse (equal mass balls)
    const impulse = velAlongNormal * PHYSICS.BALL_RESTITUTION;

    // Apply impulse
    b1.vel = vec2Sub(b1.vel, vec2Scale(normal, impulse));
    b2.vel = vec2Add(b2.vel, vec2Scale(normal, impulse));

    // Separate overlapping balls
    const overlap = TABLE.BALL_RADIUS * 2 - vec2Distance(b1.pos, b2.pos);
    if (overlap > 0) {
        const separation = vec2Scale(normal, overlap / 2 + 0.001);
        b1.pos = vec2Sub(b1.pos, separation);
        b2.pos = vec2Add(b2.pos, separation);
    }
}

function handleCushionCollision(ball: SimBall): boolean {
    const r = TABLE.BALL_RADIUS;
    const cushion = TABLE.CUSHION;
    let hit = false;
    const isCue = ball.id === 'cue';

    // Left cushion
    if (ball.pos.x - r < cushion) {
        ball.pos.x = cushion + r;
        ball.vel.x = -ball.vel.x * PHYSICS.CUSHION_RESTITUTION;
        if (isCue) applySideSpinOnCushion(ball, 'y');
        hit = true;
    }

    // Right cushion
    if (ball.pos.x + r > TABLE.WIDTH - cushion) {
        ball.pos.x = TABLE.WIDTH - cushion - r;
        ball.vel.x = -ball.vel.x * PHYSICS.CUSHION_RESTITUTION;
        if (isCue) applySideSpinOnCushion(ball, 'y');
        hit = true;
    }

    // Top cushion
    if (ball.pos.y - r < cushion) {
        ball.pos.y = cushion + r;
        ball.vel.y = -ball.vel.y * PHYSICS.CUSHION_RESTITUTION;
        if (isCue) applySideSpinOnCushion(ball, 'x');
        hit = true;
    }

    // Bottom cushion
    if (ball.pos.y + r > TABLE.HEIGHT - cushion) {
        ball.pos.y = TABLE.HEIGHT - cushion - r;
        ball.vel.y = -ball.vel.y * PHYSICS.CUSHION_RESTITUTION;
        if (isCue) applySideSpinOnCushion(ball, 'x');
        hit = true;
    }

    return hit;
}

function applySideSpinOnCushion(ball: SimBall, axis: 'x' | 'y'): void {
    const spinX = ball.spin.x;
    if (Math.abs(spinX) < 0.01) return;

    // Side spin deflects the ball along the cushion
    const speed = vec2Length(ball.vel);
    const deflection = speed * spinX * SPIN_SIDE_CUSHION;
    if (axis === 'y') {
        ball.vel.y += deflection;
    } else {
        ball.vel.x += deflection;
    }
}

export function getBallPocketIndex(pos: Vec2): number {
    for (let i = 0; i < POCKETS.length; i++) {
        const dist = vec2Distance(pos, POCKETS[i]);
        if (dist < TABLE.POCKET_RADIUS) {
            return i;
        }
    }
    return -1;
}

// ============================================
// State Building
// ============================================

function createKeyframe(timeMs: number, balls: SimBall[]): KeyFrame {
    return {
        time: timeMs,
        balls: balls.map(b => ({
            id: b.id,
            pos: { x: b.pos.x, y: b.pos.y },
            inPlay: b.inPlay,
        })),
    };
}

function buildFinalState(
    originalState: TableState,
    balls: SimBall[],
    newlyPocketed: BallId[]
): TableState {
    return {
        ...originalState,
        balls: balls.map(b => ({
            id: b.id,
            pos: { x: b.pos.x, y: b.pos.y },
            vel: { x: 0, y: 0 }, // All balls stopped
            inPlay: b.inPlay,
        })),
        pocketed: [...originalState.pocketed, ...newlyPocketed],
    };
}

function buildShotSummary(
    originalState: TableState,
    finalState: TableState,
    firstContact: BallId | null,
    pocketedBalls: BallId[],
    scratch: boolean,
    railAfterContact: boolean,
    pocketIndices: Map<BallId, number>
): ShotSummary {
    // Determine foul type
    let foul: FoulType | null = null;
    let foulReason: string | null = null;

    if (scratch) {
        foul = 'SCRATCH';
        foulReason = 'Cue ball was pocketed';
    } else if (firstContact === null) {
        foul = 'NO_CONTACT';
        foulReason = 'Cue ball did not hit any ball';
    } else if (!railAfterContact && pocketedBalls.length === 0) {
        foul = 'NO_RAIL';
        foulReason = 'No ball hit a rail after contact';
    } else if (!originalState.openTable) {
        const playerGroup = originalState.turnSeat === 1
            ? originalState.groups.seat1Group
            : originalState.groups.seat2Group;

        if (playerGroup && firstContact !== '8') {
            const firstBallNum = parseInt(firstContact, 10);
            const hitSolid = firstBallNum >= 1 && firstBallNum <= 7;
            const hitStripe = firstBallNum >= 9 && firstBallNum <= 15;

            if (playerGroup === 'SOLIDS' && hitStripe) {
                foul = 'WRONG_BALL_FIRST';
                foulReason = 'Hit stripe ball first when assigned solids';
            } else if (playerGroup === 'STRIPES' && hitSolid) {
                foul = 'WRONG_BALL_FIRST';
                foulReason = 'Hit solid ball first when assigned stripes';
            }
        }

        // Fix: hitting 8-ball first when group NOT cleared is a foul
        if (playerGroup && firstContact === '8') {
            if (!isGroupCleared(originalState, originalState.turnSeat)) {
                foul = 'WRONG_BALL_FIRST';
                foulReason = 'Hit 8-ball first before clearing group';
            }
        }
    }

    // Check for early 8-ball pocket
    if (pocketedBalls.includes('8')) {
        const playerGroup = originalState.turnSeat === 1
            ? originalState.groups.seat1Group
            : originalState.groups.seat2Group;

        if (playerGroup) {
            // Check if player's group is cleared
            const remainingPlayerBalls = finalState.balls.filter(b => {
                if (!b.inPlay || b.id === 'cue' || b.id === '8') return false;
                const num = parseInt(b.id, 10);
                if (playerGroup === 'SOLIDS') return num >= 1 && num <= 7;
                return num >= 9 && num <= 15;
            });

            if (remainingPlayerBalls.length > 0) {
                foul = 'EARLY_8_POCKET';
                foulReason = 'Pocketed 8-ball before clearing group';
            }
        }
    }

    // Determine if turn changes
    const turnChanged = foul !== null ||
        pocketedBalls.filter(id => id !== 'cue').length === 0;

    // Determine if game is over
    let gameOver = false;
    let winner = null;

    if (pocketedBalls.includes('8')) {
        gameOver = true;
        if (foul === 'EARLY_8_POCKET' || scratch) {
            // Loss - opponent wins
            winner = originalState.turnSeat === 1 ? 2 : 1;
        } else {
            // Win - current player wins
            winner = originalState.turnSeat;
        }
    }

    return {
        firstContact,
        pocketedBalls,
        scratch,
        foul,
        foulReason,
        turnChanged,
        gameOver,
        winner: winner as ShotSummary['winner'],
        pocketIndices: Object.fromEntries(pocketIndices),
    };
}
