#!/usr/bin/env node
/**
 * Norwegian Parliamentary Debates MCP Server (stdio transport)
 *
 * Provides tools for searching Norwegian Storting parliamentary debates
 * from the ParlaMint-NO 3.0 corpus (CLARIN.SI, CC-BY-4.0).
 *
 * Zero-hallucination: never generates speeches, only returns verified database entries.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from '@ansvar/mcp-sqlite';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import type { AboutContext } from './tools/about.js';
import { registerTools } from './tools/registry.js';
import {
  detectCapabilities,
  readDbMetadata,
  type Capability,
  type DbMetadata,
} from './capabilities.js';

const SERVER_NAME = 'norwegian-parliamentary-debates';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PKG_PATH = path.join(__dirname, '..', 'package.json');
const pkgVersion: string = JSON.parse(readFileSync(PKG_PATH, 'utf-8')).version;

const DB_ENV_VAR = 'DEBATES_DB_PATH';
const DEFAULT_DB_PATH = '../data/database.db';

let dbInstance: InstanceType<typeof Database> | null = null;
let serverCapabilities: Set<Capability> | null = null;
let serverMetadata: DbMetadata | null = null;

function getDb(): InstanceType<typeof Database> {
  if (!dbInstance) {
    const dbPath = process.env[DB_ENV_VAR] || getDefaultDbPath();
    console.error(`[${SERVER_NAME}] Opening database: ${dbPath}`);
    dbInstance = new Database(dbPath, { readonly: true });
    dbInstance.pragma('foreign_keys = ON');
    console.error(`[${SERVER_NAME}] Database opened successfully`);

    serverCapabilities = detectCapabilities(dbInstance);
    serverMetadata = readDbMetadata(dbInstance);
    console.error(`[${SERVER_NAME}] Tier: ${serverMetadata.tier}`);
    console.error(`[${SERVER_NAME}] Capabilities: ${[...serverCapabilities].join(', ')}`);
  }
  return dbInstance;
}

export function getCapabilities(): Set<Capability> {
  if (!serverCapabilities) getDb();
  return serverCapabilities!;
}

export function getMetadata(): DbMetadata {
  if (!serverMetadata) getDb();
  return serverMetadata!;
}

function getDefaultDbPath(): string {
  return path.resolve(__dirname, DEFAULT_DB_PATH);
}

function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.error(`[${SERVER_NAME}] Database closed`);
  }
}

function computeAboutContext(): AboutContext {
  let fingerprint = 'unknown';
  let dbBuilt = new Date().toISOString();
  try {
    const dbPath = process.env[DB_ENV_VAR] || getDefaultDbPath();
    const dbBuffer = readFileSync(dbPath);
    fingerprint = createHash('sha256').update(dbBuffer).digest('hex').slice(0, 12);
    const dbStat = statSync(dbPath);
    dbBuilt = dbStat.mtime.toISOString();
  } catch {
    // Non-fatal
  }
  return { version: pkgVersion, fingerprint, dbBuilt };
}

const aboutContext = computeAboutContext();

const server = new Server(
  { name: SERVER_NAME, version: pkgVersion },
  { capabilities: { tools: {} } }
);

registerTools(server, getDb(), aboutContext);

async function main(): Promise<void> {
  console.error(`[${SERVER_NAME}] Starting server v${pkgVersion}...`);

  const transport = new StdioServerTransport();

  process.on('SIGINT', () => {
    console.error(`[${SERVER_NAME}] Shutting down...`);
    closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.error(`[${SERVER_NAME}] Shutting down...`);
    closeDb();
    process.exit(0);
  });

  await server.connect(transport);
  console.error(`[${SERVER_NAME}] Server started successfully`);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  closeDb();
  process.exit(1);
});
