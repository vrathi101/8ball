/**
 * 8-Ball Pool - Game Canvas Component
 * Renders the pool table, balls, aim line, and ghost ball preview
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
}: GameCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Get canvas mouse position in table coordinates
    const getTablePos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        return toTable(canvasX, canvasY);
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const pos = getTablePos(e);
        if (pos && onCanvasClick) {
            onCanvasClick(pos[0], pos[1]);
        }
    }, [getTablePos, onCanvasClick]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const pos = getTablePos(e);
        if (pos && onCanvasMove) {
            onCanvasMove(pos[0], pos[1]);
        }
    }, [getTablePos, onCanvasMove]);

    const handleMouseUp = useCallback(() => {
        if (onCanvasRelease) {
            onCanvasRelease();
        }
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
        ctx.fillStyle = '#000000';
        for (const pocket of POCKETS) {
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
    }, []);

    const drawBall = useCallback((ctx: CanvasRenderingContext2D, ball: BallState, alpha = 1) => {
        if (!ball.inPlay) return;

        const [x, y] = toCanvas(ball.pos.x, ball.pos.y);
        const radius = TABLE.BALL_RADIUS * SCALE;
        const color = BALL_COLORS[ball.id] || '#FFFFFF';
        const isStripe = STRIPE_BALL_IDS.includes(ball.id as typeof STRIPE_BALL_IDS[number]);

        ctx.globalAlpha = alpha;

        // Ball shadow
        ctx.beginPath();
        ctx.arc(x + 3, y + 3, radius, 0, Math.PI * 2);
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
        if (ball.id !== 'cue') {
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

        // Draw aim line and cue if aiming
        drawAimLine(ctx);
    }, [tableState, drawTable, drawBall, drawAimLine]);

    useEffect(() => {
        draw();
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
            />
        </div>
    );
}
