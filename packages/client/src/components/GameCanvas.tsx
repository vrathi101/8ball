/**
 * 8-Ball Pool - Game Canvas Component
 * Renders the pool table, balls, aim line, ghost ball preview, and pocket highlights
 */

import { useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { TableState, BallState, Vec2, KeyFrameEvent } from '@8ball/shared';
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
    cueDeflectionAngle?: number;
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
    collisionEvents?: KeyFrameEvent[];
}

// Canvas scaling (pixels per meter)
const SCALE = 400;
const TABLE_PIXEL_WIDTH = TABLE.WIDTH * SCALE;
const TABLE_PIXEL_HEIGHT = TABLE.HEIGHT * SCALE;
const STAGE_PADDING = 140;
const CANVAS_WIDTH = TABLE_PIXEL_WIDTH + STAGE_PADDING * 2;
const CANVAS_HEIGHT = TABLE_PIXEL_HEIGHT + STAGE_PADDING * 2;

// Convert table coordinates to canvas pixels
function toCanvas(x: number, y: number): [number, number] {
    return [x * SCALE + STAGE_PADDING, y * SCALE + STAGE_PADDING];
}

// Convert canvas pixels to table coordinates
function toTable(canvasX: number, canvasY: number): [number, number] {
    return [(canvasX - STAGE_PADDING) / SCALE, (canvasY - STAGE_PADDING) / SCALE];
}

function isWithinTable(x: number, y: number): boolean {
    return x >= 0 && x <= TABLE.WIDTH && y >= 0 && y <= TABLE.HEIGHT;
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
    collisionEvents = [],
}: GameCanvasProps) {
    const tableCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const pocketAnimRef = useRef<Map<string, { startTime: number; pocketIdx: number }>>(new Map());
    const impactFlashRef = useRef<Array<{ x: number; y: number; startTime: number; speed: number }>>([]);
    const feltPatternRef = useRef<CanvasPattern | null>(null);

    // Track collision events for impact flashes
    useEffect(() => {
        const now = performance.now();
        for (const evt of collisionEvents) {
            if (evt.type === 'ball_ball' && evt.speed > 3.0) {
                // Avoid duplicates by checking proximity
                const isDupe = impactFlashRef.current.some(f =>
                    Math.abs(f.x - evt.pos.x) < 0.01 && Math.abs(f.y - evt.pos.y) < 0.01 && now - f.startTime < 150
                );
                if (!isDupe) {
                    impactFlashRef.current.push({ x: evt.pos.x, y: evt.pos.y, startTime: now, speed: evt.speed });
                }
            }
        }
    }, [collisionEvents]);

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
        const canvas = overlayCanvasRef.current;
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

        if (onCanvasClick && isWithinTable(pos[0], pos[1])) {
            onCanvasClick(pos[0], pos[1]);
        }
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

        if (onCanvasClick && isWithinTable(pos[0], pos[1])) {
            onCanvasClick(pos[0], pos[1]);
        }
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
        const tableLeft = STAGE_PADDING;
        const tableTop = STAGE_PADDING;

        // Stage background (mobile tabletop style)
        const stageGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        stageGradient.addColorStop(0, '#eeeeee');
        stageGradient.addColorStop(1, '#d7d7d7');
        ctx.fillStyle = stageGradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Table drop shadow to separate from background
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.filter = 'blur(8px)';
        ctx.fillRect(tableLeft + 10, tableTop + 12, TABLE_PIXEL_WIDTH, TABLE_PIXEL_HEIGHT);
        ctx.restore();

        // Draw outer rail
        ctx.fillStyle = '#4a2c17';
        ctx.fillRect(tableLeft, tableTop, TABLE_PIXEL_WIDTH, TABLE_PIXEL_HEIGHT);

        // Draw inner rail (cushion area)
        const cushionPx = TABLE.CUSHION * SCALE * 0.7;
        ctx.fillStyle = '#3d2412';
        ctx.fillRect(
            tableLeft + cushionPx,
            tableTop + cushionPx,
            TABLE_PIXEL_WIDTH - cushionPx * 2,
            TABLE_PIXEL_HEIGHT - cushionPx * 2
        );

        // Draw felt (playable area)
        const railPx = TABLE.CUSHION * SCALE;
        ctx.fillStyle = '#0d6b3f';
        ctx.fillRect(
            tableLeft + railPx,
            tableTop + railPx,
            TABLE_PIXEL_WIDTH - railPx * 2,
            TABLE_PIXEL_HEIGHT - railPx * 2
        );

        // Draw felt cloth texture (noise pattern)
        if (!feltPatternRef.current) {
            const tile = document.createElement('canvas');
            tile.width = 8;
            tile.height = 8;
            const tCtx = tile.getContext('2d')!;
            const imgData = tCtx.createImageData(8, 8);
            for (let i = 0; i < imgData.data.length; i += 4) {
                const noise = Math.random() * 20 - 10;
                imgData.data[i] = 13 + noise;      // R
                imgData.data[i + 1] = 107 + noise;  // G
                imgData.data[i + 2] = 63 + noise;   // B
                imgData.data[i + 3] = 30;            // A (subtle overlay)
            }
            tCtx.putImageData(imgData, 0, 0);
            feltPatternRef.current = ctx.createPattern(tile, 'repeat');
        }
        if (feltPatternRef.current) {
            ctx.fillStyle = feltPatternRef.current;
            ctx.fillRect(
                tableLeft + railPx,
                tableTop + railPx,
                TABLE_PIXEL_WIDTH - railPx * 2,
                TABLE_PIXEL_HEIGHT - railPx * 2
            );
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
        ctx.moveTo(headX, tableTop + railPx);
        ctx.lineTo(headX, tableTop + TABLE_PIXEL_HEIGHT - railPx);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw foot spot
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        const [footX, footY] = toCanvas(TABLE.FOOT_SPOT_X, TABLE.HEIGHT / 2);
        ctx.beginPath();
        ctx.arc(footX, footY, 4, 0, Math.PI * 2);
        ctx.fill();

        // Draw diamond sights on rails
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        const diamondSize = 3;
        const drawDiamond = (dx: number, dy: number) => {
            ctx.beginPath();
            ctx.moveTo(dx, dy - diamondSize);
            ctx.lineTo(dx + diamondSize, dy);
            ctx.lineTo(dx, dy + diamondSize);
            ctx.lineTo(dx - diamondSize, dy);
            ctx.closePath();
            ctx.fill();
        };
        // Long rails (top and bottom): 8 diamonds between corner pockets
        const longRailY_top = TABLE.CUSHION * SCALE * 0.35;
        const longRailY_bot = TABLE_PIXEL_HEIGHT - TABLE.CUSHION * SCALE * 0.35;
        for (let i = 1; i <= 8; i++) {
            const x = tableLeft + (TABLE.CUSHION + (TABLE.WIDTH - 2 * TABLE.CUSHION) * i / 9) * SCALE;
            drawDiamond(x, tableTop + longRailY_top);
            drawDiamond(x, tableTop + longRailY_bot);
        }
        // Short rails (left and right): 4 diamonds between corner pockets
        const shortRailX_left = tableLeft + TABLE.CUSHION * SCALE * 0.35;
        const shortRailX_right = tableLeft + TABLE_PIXEL_WIDTH - TABLE.CUSHION * SCALE * 0.35;
        for (let i = 1; i <= 4; i++) {
            const y = tableTop + (TABLE.CUSHION + (TABLE.HEIGHT - 2 * TABLE.CUSHION) * i / 5) * SCALE;
            drawDiamond(shortRailX_left, y);
            drawDiamond(shortRailX_right, y);
        }
    }, [callingPocket, selectedPocket]);

    const drawBall = useCallback((ctx: CanvasRenderingContext2D, ball: BallState, alpha = 1, scale = 1) => {
        if (!ball.inPlay && scale === 1) return;

        const [x, y] = toCanvas(ball.pos.x, ball.pos.y);
        const radius = TABLE.BALL_RADIUS * SCALE * scale;
        const color = BALL_COLORS[ball.id] || '#FFFFFF';
        const isStripe = STRIPE_BALL_IDS.includes(ball.id as typeof STRIPE_BALL_IDS[number]);

        ctx.globalAlpha = alpha;

        // Elliptical ball shadow (depth effect - light from upper left)
        ctx.save();
        ctx.translate(x + 3 * scale, y + 4 * scale);
        ctx.scale(1, 0.6); // compress vertically for ellipse
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.05, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 0, 0, ${0.35 * alpha})`;
        ctx.fill();
        ctx.restore();

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
        const ANIM_DURATION = 500;
        const toRemove: string[] = [];

        for (const [ballId, anim] of pocketAnimRef.current) {
            const elapsed = now - anim.startTime;
            if (elapsed > ANIM_DURATION) {
                toRemove.push(ballId);
                continue;
            }

            const t = elapsed / ANIM_DURATION;
            // Cubic ease-in: ball accelerates into pocket
            const tCubic = t * t * t;
            // Alpha: gradual then rapid fade
            const alpha = Math.max(0, 1 - tCubic * 1.5);
            // Scale: shrinks faster at end (depth illusion)
            const scale = Math.max(0, 1 - tCubic * 1.2);

            const ball = tableState.balls.find(b => b.id === ballId);
            if (!ball) continue;

            // Curved path toward pocket with slight arc
            const pocket = POCKETS[anim.pocketIdx];
            const curveOffset = Math.sin(t * Math.PI) * 0.01 * (1 - t);
            const animBall: BallState = {
                ...ball,
                pos: {
                    x: ball.pos.x + (pocket.x - ball.pos.x) * tCubic + curveOffset,
                    y: ball.pos.y + (pocket.y - ball.pos.y) * tCubic + curveOffset,
                },
                inPlay: true,
            };

            // Growing shadow as ball "falls deeper"
            const [sx, sy] = toCanvas(animBall.pos.x, animBall.pos.y);
            const shadowRadius = TABLE.BALL_RADIUS * SCALE * scale * (1 + tCubic * 0.5);
            ctx.beginPath();
            ctx.arc(sx, sy, shadowRadius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 0, 0, ${0.4 + tCubic * 0.4})`;
            ctx.fill();

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

            // Draw cue ball deflection path (position play guide)
            if (collision.cueDeflectionAngle !== undefined) {
                const deflectLength = 0.5 * SCALE; // 50cm
                const [ghostX2, ghostY2] = toCanvas(collision.point.x, collision.point.y);
                const deflEndX = ghostX2 + Math.cos(collision.cueDeflectionAngle) * deflectLength;
                const deflEndY = ghostY2 + Math.sin(collision.cueDeflectionAngle) * deflectLength;

                ctx.strokeStyle = 'rgba(150, 200, 255, 0.3)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 6]);
                ctx.beginPath();
                ctx.moveTo(ghostX2, ghostY2);
                ctx.lineTo(deflEndX, deflEndY);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // Draw cue stick
        // The cue extends from the ball position outward (opposite aim direction).
        // We compute ideal positions, then clip the line segment to canvas bounds
        // using Liang-Barsky so it's ALWAYS visible regardless of ball position.
        const idealCueLength = 0.5 * SCALE;
        const cueStartDist = aimPower * 0.25 * SCALE + 20; // Pull back based on power
        const cueAngle = aimAngle + Math.PI; // Point opposite to aim direction

        const cosA = Math.cos(cueAngle);
        const sinA = Math.sin(cueAngle);

        // Ideal (unclipped) cue tip and butt positions
        const idealTipX = startX + cosA * cueStartDist;
        const idealTipY = startY + sinA * cueStartDist;
        const idealButtX = idealTipX + cosA * idealCueLength;
        const idealButtY = idealTipY + sinA * idealCueLength;

        // Liang-Barsky line clipping to canvas rectangle
        const clipLine = (x0: number, y0: number, x1: number, y1: number): [number, number, number, number] | null => {
            const dx = x1 - x0;
            const dy = y1 - y0;
            const pad = 4; // small padding from edge
            const xmin = pad, xmax = CANVAS_WIDTH - pad;
            const ymin = pad, ymax = CANVAS_HEIGHT - pad;

            const p = [-dx, dx, -dy, dy];
            const q = [x0 - xmin, xmax - x0, y0 - ymin, ymax - y0];

            let tMin = 0, tMax = 1;
            for (let i = 0; i < 4; i++) {
                if (p[i] === 0) {
                    if (q[i] < 0) return null; // parallel and outside
                } else {
                    const t = q[i] / p[i];
                    if (p[i] < 0) { if (t > tMin) tMin = t; }
                    else { if (t < tMax) tMax = t; }
                }
            }
            if (tMin > tMax) return null;
            return [
                x0 + tMin * dx, y0 + tMin * dy,
                x0 + tMax * dx, y0 + tMax * dy,
            ];
        };

        const clipped = clipLine(idealTipX, idealTipY, idealButtX, idealButtY);
        if (!clipped) {
            // Entire cue is off-screen (shouldn't happen normally), skip drawing
        } else {
            const [drawTipX, drawTipY, drawButtX, drawButtY] = clipped;

            // Cue shadow
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 10;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(drawTipX + 2, drawTipY + 2);
            ctx.lineTo(drawButtX + 2, drawButtY + 2);
            ctx.stroke();

            // Use ideal (unclipped) endpoints for gradient so colors stay consistent
            const gradient = ctx.createLinearGradient(idealTipX, idealTipY, idealButtX, idealButtY);
            gradient.addColorStop(0, '#e8d8b8');     // tip/ferrule - pale ivory
            gradient.addColorStop(0.08, '#f5f0e0');   // ferrule end - white band
            gradient.addColorStop(0.10, '#f0d898');    // shaft start - maple
            gradient.addColorStop(0.60, '#c8962e');    // shaft - golden maple
            gradient.addColorStop(0.65, '#1a1a1a');    // wrap start - dark leather
            gradient.addColorStop(0.85, '#2a1a0a');    // wrap end - dark brown
            gradient.addColorStop(0.87, '#4a2c17');    // butt start
            gradient.addColorStop(1, '#1a0e08');       // butt end

            ctx.strokeStyle = gradient;
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(drawTipX, drawTipY);
            ctx.lineTo(drawButtX, drawButtY);
            ctx.stroke();

            // Ferrule white band (only if tip is visible i.e. not clipped away)
            const ferruleFrac = 0.08;
            const ferruleX = idealTipX + cosA * idealCueLength * ferruleFrac;
            const ferruleY = idealTipY + sinA * idealCueLength * ferruleFrac;
            if (ferruleX > 0 && ferruleX < CANVAS_WIDTH && ferruleY > 0 && ferruleY < CANVAS_HEIGHT) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 9;
                ctx.beginPath();
                ctx.moveTo(ferruleX - cosA * 3, ferruleY - sinA * 3);
                ctx.lineTo(ferruleX + cosA * 3, ferruleY + sinA * 3);
                ctx.stroke();
            }

            // Power glow on cue tip (only if tip is on-canvas)
            if (idealTipX > -20 && idealTipX < CANVAS_WIDTH + 20 &&
                idealTipY > -20 && idealTipY < CANVAS_HEIGHT + 20) {
                const glowAlpha = aimPower * 0.6;
                if (glowAlpha > 0.05) {
                    const glowRadius = 8 + aimPower * 12;
                    const glow = ctx.createRadialGradient(
                        drawTipX, drawTipY, 2,
                        drawTipX, drawTipY, glowRadius
                    );
                    glow.addColorStop(0, `rgba(100, 180, 255, ${glowAlpha})`);
                    glow.addColorStop(1, 'rgba(100, 180, 255, 0)');
                    ctx.beginPath();
                    ctx.arc(drawTipX, drawTipY, glowRadius, 0, Math.PI * 2);
                    ctx.fillStyle = glow;
                    ctx.fill();
                }

                // Cue tip
                ctx.fillStyle = '#4a90d9';
                ctx.beginPath();
                ctx.arc(drawTipX, drawTipY, 5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }, [tableState, isAiming, trajectoryLine, collision, aimAngle, aimPower]);

    const drawImpactFlashes = useCallback((ctx: CanvasRenderingContext2D) => {
        const now = performance.now();
        const FLASH_DURATION = 150;
        const toKeep: typeof impactFlashRef.current = [];

        for (const flash of impactFlashRef.current) {
            const elapsed = now - flash.startTime;
            if (elapsed > FLASH_DURATION) continue;
            toKeep.push(flash);

            const t = elapsed / FLASH_DURATION;
            const [fx, fy] = toCanvas(flash.x, flash.y);
            const maxRadius = (flash.speed / 5) * 15 + 5;
            const radius = maxRadius * t;
            const alpha = (1 - t) * 0.6;

            ctx.beginPath();
            ctx.arc(fx, fy, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fill();
        }

        impactFlashRef.current = toKeep;
    }, []);

    const drawTableScene = useCallback(() => {
        const canvas = tableCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        drawTable(ctx);

        for (const ball of tableState.balls) {
            drawBall(ctx, ball);
        }

        drawPocketAnimations(ctx);
        drawImpactFlashes(ctx);
    }, [tableState, drawTable, drawBall, drawPocketAnimations, drawImpactFlashes]);

    const drawOverlayScene = useCallback(() => {
        const canvas = overlayCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        drawAimLine(ctx);
    }, [drawAimLine]);

    const draw = useCallback(() => {
        drawTableScene();
        drawOverlayScene();
    }, [drawTableScene, drawOverlayScene]);

    const containerStyle: CSSProperties = {
        ['--canvas-w' as string]: String(CANVAS_WIDTH),
        ['--canvas-h' as string]: String(CANVAS_HEIGHT),
    };

    useEffect(() => {
        let animFrame: number;
        const hasActiveAnims = pocketAnimRef.current.size > 0 || impactFlashRef.current.length > 0;

        if (hasActiveAnims) {
            const loop = () => {
                draw();
                if (pocketAnimRef.current.size > 0 || impactFlashRef.current.length > 0) {
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
        <div
            className="game-canvas-container"
            style={containerStyle}
        >
            <canvas
                ref={tableCanvasRef}
                className="game-canvas game-canvas-table"
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
            />
            <canvas
                ref={overlayCanvasRef}
                className="game-canvas game-canvas-overlay"
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
