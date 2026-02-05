/**
 * 8-Ball Pool - Database Module
 * SQLite database initialization and schema
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/8ball.db');

export function initDatabase(): Database.Database {
    const db = new Database(DB_PATH);

    // Enable foreign keys
    db.pragma('foreign_keys = ON');

    // Create tables
    db.exec(`
    -- Games table
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      status TEXT CHECK(status IN ('WAITING', 'IN_PROGRESS', 'FINISHED', 'ABANDONED')) DEFAULT 'WAITING',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      current_turn_seat INTEGER CHECK(current_turn_seat IN (1, 2)) DEFAULT 1,
      version INTEGER DEFAULT 0,
      break_seat INTEGER CHECK(break_seat IN (1, 2)) DEFAULT 1,
      winner_seat INTEGER,
      join_token_p2 TEXT,
      join_token_used INTEGER DEFAULT 0
    );

    -- Players table
    CREATE TABLE IF NOT EXISTS game_players (
      id TEXT PRIMARY KEY,
      game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
      seat INTEGER CHECK(seat IN (1, 2)),
      display_name TEXT,
      player_token_hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_seen_at TEXT,
      UNIQUE(game_id, seat)
    );

    -- State snapshots
    CREATE TABLE IF NOT EXISTS game_snapshots (
      game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
      version INTEGER,
      state_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY(game_id, version)
    );

    -- Event log
    CREATE TABLE IF NOT EXISTS game_events (
      id TEXT PRIMARY KEY,
      game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
      seq INTEGER,
      type TEXT,
      payload_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_snapshots_game_id ON game_snapshots(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_events_game_id_seq ON game_events(game_id, seq);
  `);

    console.log('✅ Database initialized');
    return db;
}

export type { Database } from 'better-sqlite3';
