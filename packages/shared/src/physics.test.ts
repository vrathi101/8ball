import { describe, expect, it } from 'vitest';
import { simulateShot } from './physics.js';
import { createInitialTableState } from './utils.js';
import type { BallId, TableState } from './types.js';

const ALL_BALL_IDS: BallId[] = [
    'cue', '1', '2', '3', '4', '5', '6', '7', '8',
    '9', '10', '11', '12', '13', '14', '15',
];

function buildState(config: {
    cue: { x: number; y: number };
    objects?: Array<{ id: BallId; x: number; y: number }>;
}): TableState {
    const base = createInitialTableState();
    const balls = ALL_BALL_IDS.map(id => ({
        id,
        pos: { x: 1.0, y: 0.5 },
        vel: { x: 0, y: 0 },
        inPlay: false,
    }));

    const cue = balls.find(b => b.id === 'cue');
    if (!cue) throw new Error('Missing cue ball');
    cue.inPlay = true;
    cue.pos = { ...config.cue };

    for (const obj of config.objects ?? []) {
        const ball = balls.find(b => b.id === obj.id);
        if (!ball) throw new Error(`Missing object ball ${obj.id}`);
        ball.inPlay = true;
        ball.pos = { x: obj.x, y: obj.y };
    }

    return {
        ...base,
        balls,
        phase: 'AIMING',
        ballInHand: false,
        ballInHandAnywhere: false,
        openTable: true,
    };
}

describe('physics pocket behavior', () => {
    it('pockets the cue ball on a direct corner shot', () => {
        const state = buildState({
            cue: { x: 0.22, y: 0.18 },
        });

        const result = simulateShot(state, {
            angle: -2.45,
            power: 0.6,
            spinX: 0,
            spinY: 0,
        });

        expect(result.summary.pocketedBalls).toContain('cue');
        const cueAfter = result.finalState.balls.find(b => b.id === 'cue');
        expect(cueAfter?.inPlay).toBe(false);
    });

    it('captures a rail-adjacent object ball near a corner jaw', () => {
        const state = buildState({
            cue: { x: 0.25, y: 0.08 },
            objects: [{ id: '1', x: 0.09, y: 0.09 }],
        });

        const result = simulateShot(state, {
            angle: 3.08,
            power: 0.55,
            spinX: 0,
            spinY: 0,
        });

        expect(result.summary.pocketedBalls).toContain('1');
        expect(result.summary.pocketedBalls.filter(id => id === '1')).toHaveLength(1);
    });

    it('emits a positive pocket impact speed event', () => {
        const state = buildState({
            cue: { x: 0.22, y: 0.18 },
        });

        const result = simulateShot(state, {
            angle: -2.45,
            power: 0.6,
            spinX: 0,
            spinY: 0,
        });

        const pocketEventSpeeds = result.keyframes
            .flatMap(frame => frame.events ?? [])
            .filter(evt => evt.type === 'ball_pocket' && evt.ballId === 'cue')
            .map(evt => evt.speed);

        expect(pocketEventSpeeds.length).toBeGreaterThan(0);
        expect(Math.max(...pocketEventSpeeds)).toBeGreaterThan(0);
    });
});
