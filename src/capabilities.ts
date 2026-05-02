/**
 * Runtime capability detection for Norwegian Parliamentary Debates MCP server.
 */

import type Database from '@ansvar/mcp-sqlite';

export type Capability = 'core_speeches';

export type Tier = 'free' | 'unknown';

export interface DbMetadata {
  tier: Tier;
  schema_version: string;
  built_at: string;
  builder: string;
}

export function detectCapabilities(db: InstanceType<typeof Database>): Set<Capability> {
  const capabilities = new Set<Capability>();

  const tables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map(r => r.name)
  );

  if (tables.has('speeches')) {
    capabilities.add('core_speeches');
  }

  return capabilities;
}

export function readDbMetadata(db: InstanceType<typeof Database>): DbMetadata {
  const defaults: DbMetadata = {
    tier: 'unknown',
    schema_version: '1',
    built_at: 'unknown',
    builder: 'unknown',
  };

  try {
    const hasTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='db_metadata'"
    ).get();

    if (!hasTable) return defaults;

    const rows = db.prepare('SELECT key, value FROM db_metadata').all() as { key: string; value: string }[];
    const meta = { ...defaults };

    for (const row of rows) {
      if (row.key === 'tier' && (row.value === 'free')) {
        meta.tier = row.value;
      } else if (row.key === 'schema_version') {
        meta.schema_version = row.value;
      } else if (row.key === 'built_at') {
        meta.built_at = row.value;
      } else if (row.key === 'builder') {
        meta.builder = row.value;
      }
    }

    return meta;
  } catch {
    return defaults;
  }
}
