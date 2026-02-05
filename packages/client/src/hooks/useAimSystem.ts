/**
 * 8-Ball Pool - Aim System
 * Handles aiming, trajectory preview, power, and shot submission
 */

import { useState, useCallback, useMemo } from 'react';
import { Vec2, BallState, TableState, ShotParams } from '@8ball/shared';
import { TABLE } from '@8ball/shared';

interface AimState {
    angle: number;        // Radians
    power: number;        // 0..1
    spinX: number;        // -1..1 (side spin)
    spinY: number;        // -1..1 (top/back spin)
    isDragging: boolean;
    isPowerDrag: boolean;
}

interface TrajectoryPoint {
    x: number;
    y: number;
}

interface CollisionPreview {
    type: 'ball' | 'cushion' | 'none';
    point: Vec2;
    targetBall?: BallState;
    reflectAngle?: number;
}

export function useAimSystem(tableState: TableState | null, isMyTurn: boolean) {
    const [aimState, setAimState] = useState<AimState>({
        angle: 0,
        power: 0.5,
        spinX: 0,
        spinY: 0,
        isDragging: false,
        isPowerDrag: false,
    });

    // Find cue ball position
    const cueBall = useMemo(() => {
        return tableState?.balls.find(b => b.id === 'cue' && b.inPlay);
    }, [tableState]);

    // Calculate trajectory line and first collision
    const trajectoryPreview = useMemo(() => {
        if (!cueBall || !tableState) {
            return { line: [], collision: null };
        }

        const line: TrajectoryPoint[] = [];
        const start = cueBall.pos;
        const direction = {
            x: Math.cos(aimState.angle),
            y: Math.sin(aimState.angle),
        };

        // Extend line until we hit something or reach max length
        const maxLength = 2.0; // 2 meters - full table length
        const stepSize = 0.01;
        const ballRadius = TABLE.BALL_RADIUS;
        const cushion = TABLE.CUSHION;

        let currentPos = { ...start };
        let collision: CollisionPreview = { type: 'none', point: start };

        for (let dist = 0; dist < maxLength; dist += stepSize) {
            const nextPos = {
                x: start.x + direction.x * dist,
                y: start.y + direction.y * dist,
            };

            // Check if we hit a ball (ghost ball preview)
            for (const ball of tableState.balls) {
                if (ball.id === 'cue' || !ball.inPlay) continue;

                const dx = nextPos.x - ball.pos.x;
                const dy = nextPos.y - ball.pos.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < (ballRadius * 2) ** 2) {
                    // Found collision - position ghost ball
                    const dist = Math.sqrt(distSq);
                    const overlap = ballRadius * 2 - dist;
                    const ghostPos = {
                        x: nextPos.x - direction.x * overlap,
                        y: nextPos.y - direction.y * overlap,
                    };

                    // Calculate reflect direction for object ball
                    const contactNormal = {
                        x: (ball.pos.x - ghostPos.x) / (ballRadius * 2),
                        y: (ball.pos.y - ghostPos.y) / (ballRadius * 2),
                    };

                    collision = {
                        type: 'ball',
                        point: ghostPos,
                        targetBall: ball,
                        reflectAngle: Math.atan2(contactNormal.y, contactNormal.x),
                    };

                    // Add points up to collision
                    line.push({ x: ghostPos.x, y: ghostPos.y });
                    return { line, collision };
                }
            }

            // Check cushion collision
            if (nextPos.x - ballRadius < cushion) {
                collision = { type: 'cushion', point: { x: cushion + ballRadius, y: nextPos.y } };
                line.push(collision.point);
                return { line, collision };
            }
            if (nextPos.x + ballRadius > TABLE.WIDTH - cushion) {
                collision = { type: 'cushion', point: { x: TABLE.WIDTH - cushion - ballRadius, y: nextPos.y } };
                line.push(collision.point);
                return { line, collision };
            }
            if (nextPos.y - ballRadius < cushion) {
                collision = { type: 'cushion', point: { x: nextPos.x, y: cushion + ballRadius } };
                line.push(collision.point);
                return { line, collision };
            }
            if (nextPos.y + ballRadius > TABLE.HEIGHT - cushion) {
                collision = { type: 'cushion', point: { x: nextPos.x, y: TABLE.HEIGHT - cushion - ballRadius } };
                line.push(collision.point);
                return { line, collision };
            }

            currentPos = nextPos;

            // Sample points for the line (every few steps)
            if (dist === 0 || dist % 0.05 < stepSize) {
                line.push({ x: currentPos.x, y: currentPos.y });
            }
        }

        line.push({ x: currentPos.x, y: currentPos.y });
        return { line, collision };
    }, [cueBall, tableState, aimState.angle]);

    // Handle aim drag
    const handleAimStart = useCallback((tableX: number, tableY: number) => {
        if (!isMyTurn || !cueBall) return;

        setAimState(prev => ({
            ...prev,
            isDragging: true,
            angle: Math.atan2(tableY - cueBall.pos.y, tableX - cueBall.pos.x) + Math.PI,
        }));
    }, [isMyTurn, cueBall]);

    const handleAimMove = useCallback((tableX: number, tableY: number) => {
        if (!cueBall) return;

        setAimState(prev => {
            if (prev.isDragging) {
                // Point cue stick opposite to drag direction
                const angle = Math.atan2(tableY - cueBall.pos.y, tableX - cueBall.pos.x) + Math.PI;
                return { ...prev, angle };
            }
            if (prev.isPowerDrag) {
                // Drag distance = power
                const dx = tableX - cueBall.pos.x;
                const dy = tableY - cueBall.pos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const power = Math.min(1, dist / 0.3); // Max power at ~30cm drag
                return { ...prev, power };
            }
            return prev;
        });
    }, [cueBall]);

    const handleAimEnd = useCallback(() => {
        setAimState(prev => ({
            ...prev,
            isDragging: false,
            isPowerDrag: false,
        }));
    }, []);

    // Set power directly (for power bar)
    const setPower = useCallback((power: number) => {
        setAimState(prev => ({ ...prev, power: Math.max(0.05, Math.min(1, power)) }));
    }, []);

    // Set spin
    const setSpin = useCallback((spinX: number, spinY: number) => {
        setAimState(prev => ({
            ...prev,
            spinX: Math.max(-1, Math.min(1, spinX)),
            spinY: Math.max(-1, Math.min(1, spinY)),
        }));
    }, []);

    // Get shot params for submission
    const getShotParams = useCallback((): ShotParams => ({
        angle: aimState.angle,
        power: aimState.power,
        spinX: aimState.spinX,
        spinY: aimState.spinY,
    }), [aimState]);

    return {
        aimState,
        cueBall,
        trajectoryPreview,
        handleAimStart,
        handleAimMove,
        handleAimEnd,
        setPower,
        setSpin,
        getShotParams,
    };
}
