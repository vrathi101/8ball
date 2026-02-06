/**
 * 8-Ball Pool - Game Canvas Component
 * Renders the pool table, balls, aim line, ghost ball preview, and pocket highlights
 */

import { useRef, useEffect, useCallback } from 'react';
import { TableState, BallState, Vec2 } from '@8ball/shared';
import { TABLE, POCKETS, BALL_COLORS, STRIPE_BALL_IDS } from '@8ball/shared';

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

interface GameCanvasProps {
    tableState: TableState;
    aimAngle?: number;
    aimPower?: number;
    cueBallPos?: Vec2;
    trajectoryLine?: TrajectoryPoint[];
    collision?: CollisionPreview | null;
    isAiming?: boolean;
    onCanvasClick?: (tableX: number, tableY: number) => void;
    onCanvasMove?: (tableX: number, tableY: number) => void;
    onCanvasRelease?: () => void;
    callingPocket?: boolean;
    onPocketClick?: (pocketIndex: number) => void;
    selectedPocket?: number | null;
    previousBalls?: BallState[];
}

// Canvas scaling (pixels per meter)
const SCALE = 400;
const CANVAS_WIDTH = TABLE.WIDTH * SCALE;
const CANVAS_HEIGHT = TABLE.HEIGHT * SCALE;

// Convert table coordinates to canvas pixels
function toCanvas(x: number, y: number): [number, number] {
    return [x * SCALE, y * SCALE];
}

// Convert canvas pixels to table coordinates
function toTable(canvasX: number, canvasY: number): [number, number] {
    return [canvasX / SCALE, canvasY / SCALE];
}

export function GameCanvas({
    tableState,
    aimAngle = 0,
    aimPower = 0.5,
    cueBallPos: _cueBallPos,
    trajectoryLine = [],
    collision = null,
    isAiming = false,
    onCanvasClick,
    onCanvasMove,
    onCanvasRelease,
    callingPocket = false,
    onPocketClick,
    selectedPocket,
    previousBalls,
}: GameCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pocketAnimRef = useRef<Map<string, { startTime: number; pocketIdx: number }>>(new Map());

    // Track balls transitioning inPlay: true -> false for pocket animation
    useEffect(() => {
        if (!previousBalls) return;
        for (const prevBall of previousBalls) {
            const curBall = tableState.balls.find(b => b.id === prevBall.id);
            if (prevBall.inPlay && curBall && !curBall.inPlay) {
                // Ball was just pocketed - find nearest pocket
                let nearestIdx = 0;
                let nearestDist = Infinity;
                for (let i = 0; i < POCKETS.length; i++) {
                    const dx = prevBall.pos.x - POCKETS[i].x;
                    const dy = prevBall.pos.y - POCKETS[i].y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
                }
                pocketAnimRef.current.set(prevBall.id, { startTime: performance.now(), pocketIdx: nearestIdx });
            }
        }
    }, [tableState.balls, previousBalls]);

    // Get canvas position from mouse or touch event
    const getTablePosFromXY = useCallback((clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (clientX - rect.left) * scaleX;
        const canvasY = (clientY - rect.top) * scaleY;
        return toTable(canvasX, canvasY);
    }, []);

    const getTablePos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        return getTablePosFromXY(e.clientX, e.clientY);
    }, [getTablePosFromXY]);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const pos = getTablePos(e);
        if (!pos) return;

        // Check if clicking a pocket during call-pocket mode
        if (callingPocket && onPocketClick) {
            for (let i = 0; i < POCKETS.length; i++) {
                const [px, py] = [POCKETS[i].x, POCKETS[i].y];
                const dx = pos[0] - px;
                const dy = pos[1] - py;
                if (Math.sqrt(dx * dx + dy * dy) < TABLE.POCKET_RADIUS * 1.5) {
                    onPocketClick(i);
                    return;
                }
            }
        }

        if (onCanvasClick) onCanvasClick(pos[0], pos[1]);
    }, [getTablePos, onCanvasClick, callingPocket, onPocketClick]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const pos = getTablePos(e);
        if (pos && onCanvasMove) onCanvasMove(pos[0], pos[1]);
    }, [getTablePos, onCanvasMove]);

    const handleMouseUp = useCallback(() => {
        if (onCanvasRelease) onCanvasRelease();
    }, [onCanvasRelease]);

    // Touch handlers
    const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const touch = e.touches[0];
        const pos = getTablePosFromXY(touch.clientX, touch.clientY);
        if (!pos) return;

        if (callingPocket && onPocketClick) {
            for (let i = 0; i < POCKETS.length; i++) {
                const [px, py] = [POCKETS[i].x, POCKETS[i].y];
                const dx = pos[0] - px;
                const dy = pos[1] - py;
                if (Math.sqrt(dx * dx + dy * dy) < TABLE.POCKET_RADIUS * 1.5) {
                    onPocketClick(i);
                    return;
                }
            }
        }

        if (onCanvasClick) onCanvasClick(pos[0], pos[1]);
    }, [getTablePosFromXY, onCanvasClick, callingPocket, onPocketClick]);

    const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const touch = e.touches[0];
        const pos = getTablePosFromXY(touch.clientX, touch.clientY);
        if (pos && onCanvasMove) onCanvasMove(pos[0], pos[1]);
    }, [getTablePosFromXY, onCanvasMove]);

    const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        if (onCanvasRelease) onCanvasRelease();
    }, [onCanvasRelease]);

    const drawTable = useCallback((ctx: CanvasRenderingContext2D) => {
        // Clear canvas
        ctx.fillStyle = '#1a1a25';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Draw outer rail
        ctx.fillStyle = '#4a2c17';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Draw inner rail (cushion area)
        const cushionPx = TABLE.CUSHION * SCALE * 0.7;
        ctx.fillStyle = '#3d2412';
        ctx.fillRect(cushionPx, cushionPx, CANVAS_WIDTH - cushionPx * 2, CANVAS_HEIGHT - cushionPx * 2);

        // Draw felt (playable area)
        const railPx = TABLE.CUSHION * SCALE;
        ctx.fillStyle = '#0d6b3f';
        ctx.fillRect(railPx, railPx, CANVAS_WIDTH - railPx * 2, CANVAS_HEIGHT - railPx * 2);

        // Draw subtle felt texture effect
        ctx.fillStyle = 'rgba(0, 100, 50, 0.15)';
        for (let i = 0; i < CANVAS_WIDTH; i += 4) {
            ctx.fillRect(i, railPx, 1, CANVAS_HEIGHT - railPx * 2);
        }

        // Draw pockets
        for (let i = 0; i < POCKETS.length; i++) {
            const pocket = POCKETS[i];
            const [px, py] = toCanvas(pocket.x, pocket.y);
            const pocketRadius = TABLE.POCKET_RADIUS * SCALE;

            // Pocket shadow
            ctx.beginPath();
            ctx.arc(px, py, pocketRadius + 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fill();

            // Pocket hole
            ctx.beginPath();
            ctx.arc(px, py, pocketRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#000000';
            ctx.fill();

            // Highlight pocket during call-pocket mode
            if (callingPocket) {
                ctx.beginPath();
                ctx.arc(px, py, pocketRadius + 3, 0, Math.PI * 2);
                ctx.strokeStyle = selectedPocket === i ? '#fbbf24' : 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = selectedPocket === i ? 4 : 2;
                ctx.stroke();
            }
        }

        // Draw head string (dashed line for break position)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.setLineDash([8, 8]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        const [headX] = toCanvas(TABLE.HEAD_STRING_X, 0);
        ctx.moveTo(headX, railPx);
        ctx.lineTo(headX, CANVAS_HEIGHT - railPx);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw foot spot
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        const [footX, footY] = toCanvas(TABLE.FOOT_SPOT_X, TABLE.HEIGHT / 2);
        ctx.beginPath();
        ctx.arc(footX, footY, 4, 0, Math.PI * 2);
        ctx.fill();
    }, [callingPocket, selectedPocket]);

    const drawBall = useCallback((ctx: CanvasRenderingContext2D, ball: BallState, alpha = 1, scale = 1) => {
        if (!ball.inPlay && scale === 1) return;

        const [x, y] = toCanvas(ball.pos.x, ball.pos.y);
        const radius = TABLE.BALL_RADIUS * SCALE * scale;
        const color = BALL_COLORS[ball.id] || '#FFFFFF';
        const isStripe = STRIPE_BALL_IDS.includes(ball.id as typeof STRIPE_BALL_IDS[number]);

        ctx.globalAlpha = alpha;

        // Ball shadow
        ctx.beginPath();
        ctx.arc(x + 3 * scale, y + 3 * scale, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 0, 0, ${0.3 * alpha})`;
        ctx.fill();

        // Ball base
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isStripe ? '#FFFFFF' : color;
        ctx.fill();

        // Stripe band (for stripe balls)
        if (isStripe) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.clip();

            // Draw colored band in the middle
            ctx.fillStyle = color;
            ctx.fillRect(x - radius, y - radius * 0.5, radius * 2, radius);
            ctx.restore();
        }

        // Ball number (centered)
        if (ball.id !== 'cue' && scale > 0.3) {
            // White circle for number
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();

            // Number text
            ctx.fillStyle = '#000000';
            ctx.font = `bold ${radius * 0.7}px 'Inter', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ball.id, x, y);
        }

        // Highlight (3D effect)
        ctx.beginPath();
        ctx.arc(x - radius * 0.25, y - radius * 0.3, radius * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * alpha})`;
        ctx.fill();

        ctx.globalAlpha = 1;
    }, []);

    const drawPocketAnimations = useCallback((ctx: CanvasRenderingContext2D) => {
        const now = performance.now();
        const ANIM_DURATION = 300;
        const toRemove: string[] = [];

        for (const [ballId, anim] of pocketAnimRef.current) {
            const elapsed = now - anim.startTime;
            if (elapsed > ANIM_DURATION) {
                toRemove.push(ballId);
                continue;
            }

            const t = elapsed / ANIM_DURATION;
            const alpha = 1 - t;
            const scale = 1 - t * 0.8;

            // Find ball in current state (it's not inPlay but we still have its last known position)
            const ball = tableState.balls.find(b => b.id === ballId);
            if (!ball) continue;

            // Lerp ball position toward pocket center
            const pocket = POCKETS[anim.pocketIdx];
            const animBall: BallState = {
                ...ball,
                pos: {
                    x: ball.pos.x + (pocket.x - ball.pos.x) * t,
                    y: ball.pos.y + (pocket.y - ball.pos.y) * t,
                },
                inPlay: true, // Force draw
            };

            drawBall(ctx, animBall, alpha, scale);
        }

        for (const id of toRemove) {
            pocketAnimRef.current.delete(id);
        }
    }, [tableState.balls, drawBall]);

    const drawAimLine = useCallback((ctx: CanvasRenderingContext2D) => {
        if (!isAiming || trajectoryLine.length < 1) return;

        const cueBall = tableState.balls.find(b => b.id === 'cue' && b.inPlay);
        if (!cueBall) return;

        const [startX, startY] = toCanvas(cueBall.pos.x, cueBall.pos.y);

        // Draw main trajectory line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.moveTo(startX, startY);

        for (const point of trajectoryLine) {
            const [px, py] = toCanvas(point.x, point.y);
            ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw ghost ball at collision point
        if (collision && collision.type === 'ball') {
            const [ghostX, ghostY] = toCanvas(collision.point.x, collision.point.y);
            const radius = TABLE.BALL_RADIUS * SCALE;

            // Ghost cue ball
            ctx.beginPath();
            ctx.arc(ghostX, ghostY, radius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fill();

            // Draw predicted object ball path
            if (collision.reflectAngle !== undefined && collision.targetBall) {
                const objectBallPathLength = 0.3; // 30cm
                const [objX, objY] = toCanvas(collision.targetBall.pos.x, collision.targetBall.pos.y);
                const endX = objX + Math.cos(collision.reflectAngle) * objectBallPathLength * SCALE;
                const endY = objY + Math.sin(collision.reflectAngle) * objectBallPathLength * SCALE;

                ctx.strokeStyle = 'rgba(255, 200, 50, 0.6)';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.moveTo(objX, objY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // Draw cue stick
        const cueLength = 0.5 * SCALE; // Visual cue length
        const cueStart = aimPower * 0.15 * SCALE + 20; // Pull back based on power
        const cueAngle = aimAngle + Math.PI; // Point opposite to aim direction

        const cueStartX = startX + Math.cos(cueAngle) * cueStart;
        const cueStartY = startY + Math.sin(cueAngle) * cueStart;
        const cueEndX = cueStartX + Math.cos(cueAngle) * cueLength;
        const cueEndY = cueStartY + Math.sin(cueAngle) * cueLength;

        // Cue shadow
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cueStartX + 2, cueStartY + 2);
        ctx.lineTo(cueEndX + 2, cueEndY + 2);
        ctx.stroke();

        // Cue stick
        const gradient = ctx.createLinearGradient(cueStartX, cueStartY, cueEndX, cueEndY);
        gradient.addColorStop(0, '#f5deb3');
        gradient.addColorStop(0.7, '#8b4513');
        gradient.addColorStop(1, '#2d1810');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(cueStartX, cueStartY);
        ctx.lineTo(cueEndX, cueEndY);
        ctx.stroke();

        // Cue tip
        ctx.fillStyle = '#1e90ff';
        ctx.beginPath();
        ctx.arc(cueStartX, cueStartY, 5, 0, Math.PI * 2);
        ctx.fill();
    }, [tableState, isAiming, trajectoryLine, collision, aimAngle, aimPower]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw table
        drawTable(ctx);

        // Draw balls
        for (const ball of tableState.balls) {
            drawBall(ctx, ball);
        }

        // Draw pocket animations (shrinking/fading)
        drawPocketAnimations(ctx);

        // Draw aim line and cue if aiming
        drawAimLine(ctx);
    }, [tableState, drawTable, drawBall, drawPocketAnimations, drawAimLine]);

    useEffect(() => {
        let animFrame: number;
        const hasActiveAnims = pocketAnimRef.current.size > 0;

        if (hasActiveAnims) {
            // Keep re-drawing while pocket animations are active
            const loop = () => {
                draw();
                if (pocketAnimRef.current.size > 0) {
                    animFrame = requestAnimationFrame(loop);
                }
            };
            animFrame = requestAnimationFrame(loop);
            return () => cancelAnimationFrame(animFrame);
        } else {
            draw();
            return;
        }
    }, [draw]);

    return (
        <div className="game-canvas-container">
            <canvas
                ref={canvasRef}
                className="game-canvas"
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            />
        </div>
    );
}
