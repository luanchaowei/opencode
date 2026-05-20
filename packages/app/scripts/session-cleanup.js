#!/usr/bin/env node

/**
 * Session Cleanup Script
 * 
 * Usage: node session-cleanup.js [options]
 * 
 * Options:
 *   --days <number>     Archive threshold in days (default: 7)
 *   --db <path>         Database path (default: ~/.local/share/opencode/opencode.db)
 *   --dry-run           Show what would be deleted without actually deleting
 *   --help              Show help
 */

import { Database } from "bun:sqlite"
import { homedir } from "node:os"
import { join } from "node:path"
import { existsSync } from "node:fs"

const args = process.argv.slice(2)
const options = {
  days: 7,
  db: join(homedir(), ".local/share/opencode/opencode.db"),
  dryRun: false,
}

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--days") {
    const daysArg = parseInt(args[++i])
    options.days = daysArg >= 0 ? daysArg : 7
  } else if (args[i] === "--db") {
    options.db = args[++i]
  } else if (args[i] === "--dry-run") {
    options.dryRun = true
  } else if (args[i] === "--all") {
    options.days = -1
  } else if (args[i] === "--help") {
    console.log(`
Session Cleanup Script

Usage: bun session-cleanup.js [options]

Options:
  --days <number>     Delete sessions archived more than N days ago (default: 7)
  --all               Delete ALL archived sessions (ignores time)
  --db <path>         Database path (default: ~/.local/share/opencode/opencode.db)
  --dry-run           Show what would be deleted without actually deleting
  --help              Show help

Examples:
  bun session-cleanup.js --days 7 --dry-run
  bun session-cleanup.js --all --dry-run
`)
    process.exit(0)
  }
}

if (!existsSync(options.db)) {
  console.error(`Database not found: ${options.db}`)
  process.exit(1)
}

const db = new Database(options.db)
db.run("PRAGMA foreign_keys = ON")

let sessions

if (options.days === -1) {
  // --all: delete all archived sessions regardless of time
  sessions = db.query(`
    SELECT id, directory, title, time_archived 
    FROM session 
    WHERE time_archived IS NOT NULL
  `).all()
  console.log(`Cleaning up ALL archived sessions`)
} else {
  const threshold = Date.now() - options.days * 24 * 60 * 60 * 1000
  console.log(`Cleaning up sessions archived before: ${new Date(threshold).toISOString()}`)
  console.log(`Threshold: ${options.days} days`)
  
  sessions = db.query(`
    SELECT id, directory, title, time_archived 
    FROM session 
    WHERE time_archived IS NOT NULL AND time_archived < $threshold
  `).all({ threshold })
}

console.log(`Found ${sessions.length} sessions to delete`)

if (sessions.length === 0) {
  console.log("No sessions to cleanup")
  db.close()
  process.exit(0)
}

if (options.dryRun) {
  console.log("\nSessions that would be deleted:")
  for (const session of sessions) {
    console.log(`  - ${session.id}: "${session.title}" (archived: ${new Date(session.time_archived).toISOString()})`)
  }
  db.close()
  process.exit(0)
}

// Delete sessions
let deleted = 0
let failed = 0

for (const session of sessions) {
  try {
    // Delete from session table (cascade will delete messages, parts, etc.)
    db.run("DELETE FROM session WHERE id = $id", { id: session.id })
    deleted++
    console.log(`Deleted: ${session.id} "${session.title}"`)
  } catch (error) {
    failed++
    console.error(`Failed to delete ${session.id}: ${error.message}`)
  }
}

console.log(`\nCleanup completed: ${deleted} deleted, ${failed} failed`)

db.close()