/**
 * 8-Ball Pool - Animation Playback Hook
 * Interpolates through keyframes to show balls moving in real-time
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { TableState, KeyFrame, KeyFrameEvent, BallState } from '@8ball/shared';
import { SoundManager } from '../audio/SoundManager';

interface AnimationState {
    isAnimating: boolean;
    currentFrame: number;
    startTime: number;
}

export function useAnimationPlayback(soundManager?: SoundManager) {
    const [animationState, setAnimationState] = useState<AnimationState>({
        isAnimating: false,
        currentFrame: 0,
        startTime: 0,
    });

    const [animatedBalls, setAnimatedBalls] = useState<BallState[] | null>(null);

    const keyframesRef = useRef<KeyFrame[]>([]);
    const animationRef = useRef<number | null>(null);
    const onCompleteRef = useRef<((finalState: TableState) => void) | null>(null);
    const finalStateRef = useRef<TableState | null>(null);
    const playedEventsUpToFrame = useRef<number>(-1);
    const activeEvents = useRef<KeyFrameEvent[]>([]);

    // Interpolate between two keyframes
    const interpolateBalls = useCallback((
        frame1: KeyFrame,
        frame2: KeyFrame,
        t: number // 0 to 1
    ): BallState[] => {
        return frame1.balls.map((ball1, i) => {
            const ball2 = frame2.balls[i];
            return {
                id: ball1.id,
                pos: {
                    x: ball1.pos.x + (ball2.pos.x - ball1.pos.x) * t,
                    y: ball1.pos.y + (ball2.pos.y - ball1.pos.y) * t,
                },
                vel: { x: 0, y: 0 },
                inPlay: ball2.inPlay, // Use end state for inPlay
            };
        });
    }, []);

    // Animation tick
    const tick = useCallback(() => {
        const keyframes = keyframesRef.current;
        if (keyframes.length < 2) {
            // Animation complete
            setAnimationState(prev => ({ ...prev, isAnimating: false }));
            setAnimatedBalls(null);
            if (onCompleteRef.current && finalStateRef.current) {
                onCompleteRef.current(finalStateRef.current);
            }
            return;
        }

        const now = performance.now();
        const elapsed = now - animationState.startTime;

        // Find which keyframes we're between
        let frameIndex = 0;
        for (let i = 0; i < keyframes.length - 1; i++) {
            if (elapsed >= keyframes[i].time && elapsed < keyframes[i + 1].time) {
                frameIndex = i;
                break;
            }
            if (elapsed >= keyframes[keyframes.length - 1].time) {
                // Animation complete
                setAnimationState(prev => ({ ...prev, isAnimating: false }));
                setAnimatedBalls(null);
                if (onCompleteRef.current && finalStateRef.current) {
                    onCompleteRef.current(finalStateRef.current);
                }
                return;
            }
        }

        const frame1 = keyframes[frameIndex];
        const frame2 = keyframes[frameIndex + 1];
        const frameDuration = frame2.time - frame1.time;
        const frameProgress = (elapsed - frame1.time) / frameDuration;
        const t = Math.max(0, Math.min(1, frameProgress));

        const interpolated = interpolateBalls(frame1, frame2, t);
        setAnimatedBalls(interpolated);
        setAnimationState(prev => ({ ...prev, currentFrame: frameIndex }));

        // Play sounds for keyframe events we haven't processed yet
        if (soundManager && soundManager.ready) {
            // Collect events from all keyframes between last played and current
            for (let k = playedEventsUpToFrame.current + 1; k <= frameIndex; k++) {
                const kfEvents = keyframes[k]?.events;
                if (kfEvents) {
                    for (const evt of kfEvents) {
                        activeEvents.current.push(evt);
                        if (evt.type === 'ball_ball') {
                            soundManager.playBallBall(evt.speed);
                        } else if (evt.type === 'ball_cushion') {
                            soundManager.playBallCushion(evt.speed);
                        } else if (evt.type === 'ball_pocket') {
                            soundManager.playPocketDrop(evt.speed);
                        }
                    }
                }
            }
            playedEventsUpToFrame.current = frameIndex;
        }

        // Continue animation
        animationRef.current = requestAnimationFrame(tick);
    }, [animationState.startTime, interpolateBalls, soundManager]);

    // Start animation
    const playAnimation = useCallback((
        keyframes: KeyFrame[],
        finalState: TableState,
        onComplete?: (state: TableState) => void
    ) => {
        // Cancel any existing animation
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }

        if (keyframes.length < 2) {
            // No animation needed
            if (onComplete) {
                onComplete(finalState);
            }
            return;
        }

        keyframesRef.current = keyframes;
        finalStateRef.current = finalState;
        onCompleteRef.current = onComplete || null;
        playedEventsUpToFrame.current = -1;
        activeEvents.current = [];

        // Set initial frame
        setAnimatedBalls(keyframes[0].balls.map(b => ({
            ...b,
            vel: { x: 0, y: 0 },
        })));

        setAnimationState({
            isAnimating: true,
            currentFrame: 0,
            startTime: performance.now(),
        });
    }, []);

    // Run animation loop when animating
    useEffect(() => {
        if (animationState.isAnimating) {
            animationRef.current = requestAnimationFrame(tick);
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [animationState.isAnimating, tick]);

    // Stop animation
    const stopAnimation = useCallback(() => {
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
        setAnimationState(prev => ({ ...prev, isAnimating: false }));
        setAnimatedBalls(null);
    }, []);

    return {
        isAnimating: animationState.isAnimating,
        animatedBalls,
        activeEvents: activeEvents.current,
        playAnimation,
        stopAnimation,
    };
}
