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
    cueDeflectionAngle?: number;
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

    // Calculate trajectory line and first collision (with cushion bounce reflection)
    const trajectoryPreview = useMemo(() => {
        if (!cueBall || !tableState) {
            return { line: [], collision: null };
        }

        const line: TrajectoryPoint[] = [];
        const ballRadius = TABLE.BALL_RADIUS;
        const cushion = TABLE.CUSHION;
        const minX = cushion + ballRadius;
        const maxX = TABLE.WIDTH - cushion - ballRadius;
        const minY = cushion + ballRadius;
        const maxY = TABLE.HEIGHT - cushion - ballRadius;

        let posX = cueBall.pos.x;
        let posY = cueBall.pos.y;
        let dirX = Math.cos(aimState.angle);
        let dirY = Math.sin(aimState.angle);

        const maxTotalDist = 2.5; // total ray length across bounces
        let remainingDist = maxTotalDist;
        let collision: CollisionPreview = { type: 'none', point: { x: posX, y: posY } };
        const MAX_BOUNCES = 3;
        let bounceCount = 0;

        while (remainingDist > 0 && bounceCount <= MAX_BOUNCES) {
            const stepSize = 0.01;

            for (let dist = 0; dist < remainingDist; dist += stepSize) {
                const nextX = posX + dirX * dist;
                const nextY = posY + dirY * dist;

                // Check ball collision (only on first segment before any cushion bounce)
                if (bounceCount === 0) {
                    for (const ball of tableState.balls) {
                        if (ball.id === 'cue' || !ball.inPlay) continue;

                        const dx = nextX - ball.pos.x;
                        const dy = nextY - ball.pos.y;
                        const distSq = dx * dx + dy * dy;

                        if (distSq < (ballRadius * 2) ** 2) {
                            const d = Math.sqrt(distSq);
                            const overlap = ballRadius * 2 - d;
                            const ghostPos = {
                                x: nextX - dirX * overlap,
                                y: nextY - dirY * overlap,
                            };

                            const contactNormal = {
                                x: (ball.pos.x - ghostPos.x) / (ballRadius * 2),
                                y: (ball.pos.y - ghostPos.y) / (ballRadius * 2),
                            };

                            const objAngle = Math.atan2(contactNormal.y, contactNormal.x);
                            const tangentX = -contactNormal.y;
                            const tangentY = contactNormal.x;
                            const dotWithIncoming = tangentX * dirX + tangentY * dirY;
                            const cueDeflectX = dotWithIncoming >= 0 ? tangentX : -tangentX;
                            const cueDeflectY = dotWithIncoming >= 0 ? tangentY : -tangentY;
                            const cueDeflectionAngle = Math.atan2(cueDeflectY, cueDeflectX);

                            collision = {
                                type: 'ball',
                                point: ghostPos,
                                targetBall: ball,
                                reflectAngle: objAngle,
                                cueDeflectionAngle,
                            };

                            line.push({ x: ghostPos.x, y: ghostPos.y });
                            return { line, collision };
                        }
                    }
                }

                // Check cushion collision
                let hitCushion = false;
                let cushionX = nextX;
                let cushionY = nextY;

                if (nextX < minX) { cushionX = minX; hitCushion = true; }
                if (nextX > maxX) { cushionX = maxX; hitCushion = true; }
                if (nextY < minY) { cushionY = minY; hitCushion = true; }
                if (nextY > maxY) { cushionY = maxY; hitCushion = true; }

                if (hitCushion) {
                    line.push({ x: cushionX, y: cushionY });
                    collision = { type: 'cushion', point: { x: cushionX, y: cushionY } };

                    // Reflect direction off cushion and continue
                    if (nextX < minX || nextX > maxX) dirX = -dirX;
                    if (nextY < minY || nextY > maxY) dirY = -dirY;

                    posX = cushionX;
                    posY = cushionY;
                    remainingDist -= dist;
                    bounceCount++;
                    break; // restart inner loop from new position
                }

                // Sample points for the line
                if (dist === 0 || dist % 0.05 < stepSize) {
                    line.push({ x: nextX, y: nextY });
                }

                // If we've exhausted distance in this segment
                if (dist + stepSize >= remainingDist) {
                    line.push({ x: nextX, y: nextY });
                    remainingDist = 0;
                    break;
                }
            }
        }

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
                // Two-zone sensitivity: fine near ball, coarse far away
                const dx = tableX - cueBall.pos.x;
                const dy = tableY - cueBall.pos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Sensitivity: 0.4x when close (<0.15m), 1.0x when far (>0.3m), lerp between
                const CLOSE_DIST = 0.15;
                const FAR_DIST = 0.3;
                const MIN_SENSITIVITY = 0.4;
                const t = Math.max(0, Math.min(1, (dist - CLOSE_DIST) / (FAR_DIST - CLOSE_DIST)));
                const sensitivity = MIN_SENSITIVITY + t * (1 - MIN_SENSITIVITY);

                // Target angle from drag position
                const targetAngle = Math.atan2(dy, dx) + Math.PI;

                // Interpolate from current angle toward target using sensitivity
                let angleDelta = targetAngle - prev.angle;
                // Normalize to [-PI, PI]
                while (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
                while (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;

                const angle = prev.angle + angleDelta * sensitivity;
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
