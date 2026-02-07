/**
 * 8-Ball Pool - Table Constants
 * All dimensions are in "table units" where the table is 2.54m x 1.27m (standard 9ft table)
 */

// Table dimensions (meters, scaled to standard 9ft table)
export const TABLE = {
    WIDTH: 2.54,
    HEIGHT: 1.27,

    // Playable area (inside cushions)
    PLAYABLE_WIDTH: 2.24,
    PLAYABLE_HEIGHT: 1.12,

    // Cushion thickness
    CUSHION: 0.05,

    // Ball radius
    BALL_RADIUS: 0.028575,  // Standard pool ball is 2.25" = 57.15mm diameter

    // Pocket radius (for detection)
    POCKET_RADIUS: 0.055,   // Slightly larger than 2 balls

    // Head string position (for break placement)
    HEAD_STRING_X: 0.635,   // 1/4 of table width from head rail

    // Foot spot (for racking)
    FOOT_SPOT_X: 1.905,     // 3/4 of table width from head rail
    FOOT_SPOT_Y: 0.635,     // Center of table
} as const;

// Pocket positions (6 pockets)
export const POCKETS = [
    { x: TABLE.CUSHION, y: TABLE.CUSHION },                               // Top-left
    { x: TABLE.WIDTH / 2, y: TABLE.CUSHION - 0.01 },                      // Top-middle
    { x: TABLE.WIDTH - TABLE.CUSHION, y: TABLE.CUSHION },                 // Top-right
    { x: TABLE.CUSHION, y: TABLE.HEIGHT - TABLE.CUSHION },                // Bottom-left
    { x: TABLE.WIDTH / 2, y: TABLE.HEIGHT - TABLE.CUSHION + 0.01 },       // Bottom-middle
    { x: TABLE.WIDTH - TABLE.CUSHION, y: TABLE.HEIGHT - TABLE.CUSHION },  // Bottom-right
] as const;

// Physics constants
export const PHYSICS = {
    // Simulation
    TIME_STEP: 1 / 240,           // Fixed timestep (240 Hz)
    KEYFRAME_INTERVAL: 33,        // Keyframe every 33ms (~30fps)

    // Ball physics
    FRICTION: 0.985,              // Legacy (unused) - kept for reference
    CUSHION_RESTITUTION: 0.8,     // Energy retained on cushion bounce
    BALL_RESTITUTION: 0.95,       // Energy retained on ball-ball collision

    // Sliding → Rolling friction model
    SLIDING_FRICTION_COEFF: 0.2,  // Cloth friction while ball slides
    ROLLING_FRICTION_COEFF: 0.015, // Cloth friction once ball rolls (upper end of real range)
    GRAVITY: 9.81,                // m/s²
    ROLLING_TRANSITION_SPEED: 0.5,// Speed below which ball transitions to rolling

    // Velocity thresholds
    MIN_VELOCITY: 0.008,          // Below this, ball is considered stopped (raised to prevent micro-drift)
    MAX_VELOCITY: 12.0,           // Maximum initial velocity (power = 1)

    // Shot power mapping
    POWER_TO_VELOCITY: 8.0,       // power^POWER_EXPONENT * this = initial velocity
    POWER_EXPONENT: 1.3,          // Non-linear power curve for fine control at low end

    // Pocket gravity well
    POCKET_MOUTH_RADIUS: 0.072,   // Outer pocket funnel where jaws start pulling the ball in
    POCKET_COMMIT_RADIUS: 0.046,  // Inner throat radius where the ball is committed
    POCKET_CAPTURE_BAND: 0.012,   // Additional inward-moving capture tolerance near the throat
    POCKET_PULL_STRENGTH: 14.0,   // m/s² pull strength toward pocket center
    POCKET_TANGENTIAL_DAMPING: 0.35, // Sideways velocity damping near pocket jaws

    // Simulation limits
    MAX_FRAMES: 30000,            // Safety limit (~2 min at 240fps)
    SETTLE_FRAMES: 10,            // Frames all balls must be stopped before ending
} as const;

// Ball colors for rendering
export const BALL_COLORS: Record<string, string> = {
    'cue': '#FFFFFF',
    '1': '#FFD700',   // Yellow (solid)
    '2': '#0000FF',   // Blue (solid)
    '3': '#FF0000',   // Red (solid)
    '4': '#800080',   // Purple (solid)
    '5': '#FF8C00',   // Orange (solid)
    '6': '#008000',   // Green (solid)
    '7': '#8B0000',   // Maroon (solid)
    '8': '#000000',   // Black
    '9': '#FFD700',   // Yellow (stripe)
    '10': '#0000FF',  // Blue (stripe)
    '11': '#FF0000',  // Red (stripe)
    '12': '#800080',  // Purple (stripe)
    '13': '#FF8C00',  // Orange (stripe)
    '14': '#008000',  // Green (stripe)
    '15': '#8B0000',  // Maroon (stripe)
} as const;

// Stripe balls (9-15) have a white band
export const STRIPE_BALL_IDS = ['9', '10', '11', '12', '13', '14', '15'] as const;
export const SOLID_BALL_IDS = ['1', '2', '3', '4', '5', '6', '7'] as const;
