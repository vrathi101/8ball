/**
 * 8-Ball Pool - Game Canvas Component
 * Renders the pool table and balls using HTML Canvas
 */

import { useRef, useEffect, useCallback } from 'react';
import { TableState, BallState } from '@8ball/shared';
import { TABLE, POCKETS, BALL_COLORS, STRIPE_BALL_IDS } from '@8ball/shared';

interface GameCanvasProps {
    tableState: TableState;
}

// Canvas scaling (pixels per meter)
const SCALE = 400;
const CANVAS_WIDTH = TABLE.WIDTH * SCALE;
const CANVAS_HEIGHT = TABLE.HEIGHT * SCALE;

// Convert table coordinates to canvas pixels
function toCanvas(x: number, y: number): [number, number] {
    return [x * SCALE, y * SCALE];
}

export function GameCanvas({ tableState }: GameCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

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
        const [headX, _] = toCanvas(TABLE.HEAD_STRING_X, 0);
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

    const drawBall = useCallback((ctx: CanvasRenderingContext2D, ball: BallState) => {
        if (!ball.inPlay) return;

        const [x, y] = toCanvas(ball.pos.x, ball.pos.y);
        const radius = TABLE.BALL_RADIUS * SCALE;
        const color = BALL_COLORS[ball.id] || '#FFFFFF';
        const isStripe = STRIPE_BALL_IDS.includes(ball.id as typeof STRIPE_BALL_IDS[number]);

        // Ball shadow
        ctx.beginPath();
        ctx.arc(x + 3, y + 3, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
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
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fill();
    }, []);

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
    }, [tableState, drawTable, drawBall]);

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
            />
        </div>
    );
}
