/** The SQL dialects the relational adapters speak. */
export type SQLDialect = 'sqlite' | 'postgres' | 'mysql';

/**
 * One step in the schema's history. A migration is applied exactly once, in
 * `version` order, and never edited after release: change the schema with a
 * new migration instead. Each statement is run as written (no splitting on
 * `;`), so string literals and comments may contain semicolons.
 */
export interface Migration {
  /** Positive integer, unique, increasing in the order migrations apply. */
  version: number;
  description: string;
  statements: string[];
}
