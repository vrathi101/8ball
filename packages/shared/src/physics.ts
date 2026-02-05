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
}

// CollisionEvent interface reserved for future use (replay features)
// interface CollisionEvent {
//     time: number;
//     type: 'ball-ball' | 'ball-cushion' | 'ball-pocket';
//     ballId: BallId;
//     otherId?: BallId;
// }

// ============================================
// Main Simulation Function
// ============================================

/**
 * Simulate a shot from the current table state
 * Returns the final state, animation keyframes, and shot summary
 */
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

    // Track events during simulation
    const pocketedBalls: BallId[] = [];
    let firstContact: BallId | null = null;
    let scratch = false;
    let railAfterContact = false;
    let anyBallHitRail = false;

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
                }
            }
        }

        // Handle ball-cushion collisions
        for (const ball of balls) {
            if (!ball.inPlay) continue;

            const cushionHit = handleCushionCollision(ball);
            if (cushionHit) {
                anyBallHitRail = true;
                if (firstContact !== null) {
                    railAfterContact = true;
                }
            }
        }

        // Handle ball-pocket detection
        for (const ball of balls) {
            if (!ball.inPlay) continue;

            if (isBallInPocket(ball.pos)) {
                ball.inPlay = false;
                pocketedBalls.push(ball.id);

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
        anyBallHitRail
    );

    return {
        finalState,
        keyframes,
        summary,
    };
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

    // Left cushion
    if (ball.pos.x - r < cushion) {
        ball.pos.x = cushion + r;
        ball.vel.x = -ball.vel.x * PHYSICS.CUSHION_RESTITUTION;
        hit = true;
    }

    // Right cushion
    if (ball.pos.x + r > TABLE.WIDTH - cushion) {
        ball.pos.x = TABLE.WIDTH - cushion - r;
        ball.vel.x = -ball.vel.x * PHYSICS.CUSHION_RESTITUTION;
        hit = true;
    }

    // Top cushion
    if (ball.pos.y - r < cushion) {
        ball.pos.y = cushion + r;
        ball.vel.y = -ball.vel.y * PHYSICS.CUSHION_RESTITUTION;
        hit = true;
    }

    // Bottom cushion
    if (ball.pos.y + r > TABLE.HEIGHT - cushion) {
        ball.pos.y = TABLE.HEIGHT - cushion - r;
        ball.vel.y = -ball.vel.y * PHYSICS.CUSHION_RESTITUTION;
        hit = true;
    }

    return hit;
}

function isBallInPocket(pos: Vec2): boolean {
    for (const pocket of POCKETS) {
        const dist = vec2Distance(pos, pocket);
        if (dist < TABLE.POCKET_RADIUS) {
            return true;
        }
    }
    return false;
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
    _anyBallHitRail: boolean
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
    } else if (!originalState.openTable && firstContact !== '8') {
        // Check if player hit their own group first
        const playerGroup = originalState.turnSeat === 1
            ? originalState.groups.seat1Group
            : originalState.groups.seat2Group;

        if (playerGroup) {
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
    };
}
