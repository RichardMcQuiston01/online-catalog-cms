import type { Migration, SQLDialect } from './types.js';

/** Every timestamp column in the schema, by table. */
const TIMESTAMP_COLUMNS: Record<string, string[]> = {
  occ_category: ['created_at', 'updated_at'],
  occ_product: ['created_at', 'updated_at'],
  occ_image: ['created_at'],
  occ_migration: ['applied_at'],
};

const INDEXES = [
  'occ_product_category_id_idx ON occ_product (category_id)',
  'occ_category_parent_id_idx ON occ_category (parent_id)',
  'occ_image_product_id_sort_order_idx ON occ_image (product_id, sort_order)',
];

/**
 * PostgreSQL: `TIMESTAMP` is a wall clock with no zone, so a value written as
 * UTC was read back shifted by the host's offset. Existing values were
 * written as UTC (`occ_migration.applied_at` as the session's local time), so
 * they are converted from that zone.
 */
function postgresStatements(): string[] {
  const alterations = Object.entries(TIMESTAMP_COLUMNS).map(
    ([table, columns]) => {
      const zone =
        table === 'occ_migration' ? "current_setting('TimeZone')" : "'UTC'";
      const changes = columns
        .map(
          (column) =>
            `ALTER COLUMN ${column} TYPE TIMESTAMPTZ USING ${column} AT TIME ZONE ${zone}`,
        )
        .join(', ');
      return `ALTER TABLE ${table} ${changes}`;
    },
  );
  return [
    ...alterations,
    ...INDEXES.map((i) => `CREATE INDEX IF NOT EXISTS ${i}`),
  ];
}

/**
 * MySQL: `TIMESTAMP` has no fractional seconds and rejects an ISO string with
 * a trailing `Z` in strict mode, so inserts failed. `DATETIME(3)` keeps
 * milliseconds; the adapter now binds `Date` values with its pool in UTC.
 * InnoDB already indexes the foreign key columns, so only the composite
 * image index is new. MySQL has no `CREATE INDEX IF NOT EXISTS`, which is
 * safe here because the runner applies a migration once.
 */
function mysqlStatements(): string[] {
  const alterations = Object.entries(TIMESTAMP_COLUMNS).map(
    ([table, columns]) =>
      `ALTER TABLE ${table} ${columns
        .map((column) => `MODIFY ${column} DATETIME(3) NOT NULL`)
        .join(', ')}`,
  );
  return [
    // Existing TIMESTAMP values are shown in the session zone; convert as UTC.
    "SET SESSION time_zone = '+00:00'",
    ...alterations,
    'SET SESSION time_zone = DEFAULT',
    'CREATE INDEX occ_image_product_id_sort_order_idx ON occ_image (product_id, sort_order)',
  ];
}

/** SQLite stores the ISO string as text and needs no column changes. */
function sqliteStatements(): string[] {
  return INDEXES.map((i) => `CREATE INDEX IF NOT EXISTS ${i}`);
}

/**
 * Migration 002: instants stored as real timestamps (`timestamptz` /
 * `DATETIME(3)`) and indexes on the columns that `list()`, the category tree
 * and `images.listByProduct` filter by, which otherwise scan the whole table.
 */
export function timestampsAndIndexesMigration(dialect: SQLDialect): Migration {
  const statements = {
    postgres: postgresStatements,
    mysql: mysqlStatements,
    sqlite: sqliteStatements,
  }[dialect]();
  return {
    version: 2,
    description: 'real timestamps and foreign key indexes',
    statements,
  };
}
