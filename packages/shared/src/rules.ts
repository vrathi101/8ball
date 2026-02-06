/**
 * 8-Ball Pool - Rules Engine
 * Handles 8-ball rules, group assignment, and turn management
 */

import {
    TableState,
    ShotSummary,
    BallId,
    Seat,
    BallGroup,
} from './types.js';
import { getOpponentSeat, getOpponentGroup, isGroupCleared } from './utils.js';

// ============================================
// Apply Shot Result to Game State
// ============================================

/**
 * Apply the result of a shot to update the game state
 * Handles group assignment, turn changes, and win conditions
 */
export function applyRules(
    state: TableState,
    summary: ShotSummary
): TableState {
    let newState = { ...state };

    // Handle break completion
    if (state.phase === 'AWAITING_BREAK') {
        newState = handleBreakResult(newState, summary);
    }

    // Handle group assignment on open table
    if (newState.openTable && !summary.foul) {
        newState = handleGroupAssignment(newState, summary);
    }

    // Handle turn change
    if (summary.turnChanged && !summary.gameOver) {
        newState.turnSeat = getOpponentSeat(state.turnSeat);
    }

    // Handle foul - ball in hand
    if (summary.foul && !summary.gameOver) {
        newState.ballInHand = true;
        newState.ballInHandAnywhere = summary.foul === 'SCRATCH' || state.phase === 'AWAITING_BREAK';
        newState.phase = 'BALL_IN_HAND';

        // If cue ball was scratched, reset it
        if (summary.scratch) {
            const cueBall = newState.balls.find(b => b.id === 'cue');
            if (cueBall) {
                cueBall.inPlay = true;
                // Will be placed by player
            }
        }
    } else if (!summary.gameOver) {
        newState.ballInHand = false;
        newState.ballInHandAnywhere = false;
        newState.phase = 'AIMING';
    }

    // Handle game over
    if (summary.gameOver) {
        newState.phase = 'FINISHED';
        newState.winningSeat = summary.winner;
    }

    // Store shot summary
    newState.lastShotSummary = summary;

    return newState;
}

// ============================================
// Break Handling
// ============================================

function handleBreakResult(
    state: TableState,
    summary: ShotSummary
): TableState {
    const newState = { ...state };

    // Check for legal break (ball pocketed or 4+ balls hit rail)
    // For MVP, we'll consider any break that hits balls as legal
    const isLegalBreak = summary.firstContact !== null;

    if (!isLegalBreak) {
        // Illegal break - foul
        summary.foul = 'NO_CONTACT';
        summary.foulReason = 'Illegal break - no ball contacted';
        summary.turnChanged = true;
    }

    // Move to regular play
    newState.phase = 'AIMING';

    // Check if 8-ball was pocketed on break
    if (summary.pocketedBalls.includes('8')) {
        if (summary.scratch) {
            // Scratch with 8-ball on break = loss
            newState.phase = 'FINISHED';
            newState.winningSeat = getOpponentSeat(state.turnSeat);
            summary.gameOver = true;
            summary.winner = newState.winningSeat;
        } else {
            // 8-ball on break without scratch - re-rack OR spot 8 and continue
            // For MVP: spot the 8-ball and continue
            const eightBall = newState.balls.find(b => b.id === '8');
            if (eightBall) {
                eightBall.inPlay = true;
                eightBall.pos = { x: 1.905, y: 0.635 }; // Foot spot
                // Remove from pocketed
                const idx = newState.pocketed.indexOf('8');
                if (idx !== -1) {
                    newState.pocketed.splice(idx, 1);
                }
                // Remove from summary
                const summaryIdx = summary.pocketedBalls.indexOf('8');
                if (summaryIdx !== -1) {
                    summary.pocketedBalls.splice(summaryIdx, 1);
                }
            }
        }
    }

    return newState;
}

// ============================================
// Group Assignment
// ============================================

function handleGroupAssignment(
    state: TableState,
    summary: ShotSummary
): TableState {
    // Only assign groups if a non-8 ball was legally pocketed
    const pocketedNon8 = summary.pocketedBalls.filter(
        id => id !== 'cue' && id !== '8'
    );

    if (pocketedNon8.length === 0) {
        return state;
    }

    // Determine which groups were pocketed
    const pocketedSolids: BallId[] = [];
    const pocketedStripes: BallId[] = [];

    for (const id of pocketedNon8) {
        const num = parseInt(id, 10);
        if (num >= 1 && num <= 7) {
            pocketedSolids.push(id);
        } else if (num >= 9 && num <= 15) {
            pocketedStripes.push(id);
        }
    }

    // If only one group was pocketed, assign that group
    let assignedGroup: BallGroup | null = null;

    if (pocketedSolids.length > 0 && pocketedStripes.length === 0) {
        assignedGroup = 'SOLIDS';
    } else if (pocketedStripes.length > 0 && pocketedSolids.length === 0) {
        assignedGroup = 'STRIPES';
    } else if (pocketedSolids.length > 0 && pocketedStripes.length > 0) {
        // Both groups pocketed - assign based on first ball pocketed
        // For MVP: assign solids if a solid was in the list first
        const firstPocketed = pocketedNon8[0];
        const firstNum = parseInt(firstPocketed, 10);
        assignedGroup = firstNum <= 7 ? 'SOLIDS' : 'STRIPES';
    }

    if (assignedGroup) {
        const newState = { ...state };
        newState.openTable = false;

        if (state.turnSeat === 1) {
            newState.groups = {
                seat1Group: assignedGroup,
                seat2Group: getOpponentGroup(assignedGroup),
            };
        } else {
            newState.groups = {
                seat1Group: getOpponentGroup(assignedGroup),
                seat2Group: assignedGroup,
            };
        }

        return newState;
    }

    return state;
}

// ============================================
// Ball Placement Validation
// ============================================

/**
 * Validate that a ball placement position is legal
 */
export function validateBallPlacement(
    state: TableState,
    position: { x: number; y: number }
): { valid: boolean; reason?: string } {
    const { x, y } = position;
    const r = 0.028575; // Ball radius
    const cushion = 0.05;

    // Check bounds
    if (x - r < cushion || x + r > 2.54 - cushion ||
        y - r < cushion || y + r > 1.27 - cushion) {
        return { valid: false, reason: 'Position outside playable area' };
    }

    // Check if behind head string (if required)
    if (!state.ballInHandAnywhere) {
        // Must be in kitchen (behind head string)
        if (x > 0.635) { // HEAD_STRING_X
            return { valid: false, reason: 'Must place behind head string' };
        }
    }

    // Check for overlap with other balls
    for (const ball of state.balls) {
        if (!ball.inPlay || ball.id === 'cue') continue;

        const dx = ball.pos.x - x;
        const dy = ball.pos.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < r * 2 + 0.001) {
            return { valid: false, reason: 'Overlaps with another ball' };
        }
    }

    return { valid: true };
}

// Re-export isGroupCleared from utils (moved there to avoid circular dep with physics)
export { isGroupCleared } from './utils.js';

/**
 * Check if it's a player's turn to shoot the 8-ball
 */
export function canShoot8Ball(state: TableState, seat: Seat): boolean {
    return !state.openTable && isGroupCleared(state, seat);
}
