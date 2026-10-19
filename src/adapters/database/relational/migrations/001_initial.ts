import type { Migration } from './types.js';

/**
 * Migration 001: the initial schema. The statements are the same for every
 * dialect. The runner records the version in `occ_migration` itself, so the
 * `INSERT` that `001_initial.sql` ends with (for running it by hand) is not
 * part of the list. A test keeps this file and the `.sql` file in step.
 */
export const initialMigration: Migration = {
  version: 1,
  description: 'initial schema',
  statements: [
    `CREATE TABLE IF NOT EXISTS occ_category (
  id          VARCHAR(36)   NOT NULL PRIMARY KEY,
  name        VARCHAR(255)  NOT NULL,
  slug        VARCHAR(255)  NOT NULL UNIQUE,
  parent_id   VARCHAR(36)   NULL REFERENCES occ_category(id) ON DELETE SET NULL,
  metadata    TEXT          NOT NULL DEFAULT '{}',
  created_at  TIMESTAMP     NOT NULL,
  updated_at  TIMESTAMP     NOT NULL
)`,
    `CREATE TABLE IF NOT EXISTS occ_product (
  id          VARCHAR(36)   NOT NULL PRIMARY KEY,
  name        VARCHAR(255)  NOT NULL,
  slug        VARCHAR(255)  NOT NULL UNIQUE,
  description TEXT          NOT NULL DEFAULT '{"version":1,"nodes":[]}',
  price       INTEGER       NOT NULL DEFAULT 0,
  sku         VARCHAR(255)  NULL,
  category_id VARCHAR(36)   NULL REFERENCES occ_category(id) ON DELETE SET NULL,
  metadata    TEXT          NOT NULL DEFAULT '{}',
  created_at  TIMESTAMP     NOT NULL,
  updated_at  TIMESTAMP     NOT NULL
)`,
    `CREATE TABLE IF NOT EXISTS occ_image (
  id          VARCHAR(36)   NOT NULL PRIMARY KEY,
  product_id  VARCHAR(36)   NOT NULL REFERENCES occ_product(id) ON DELETE CASCADE,
  url         TEXT          NOT NULL,
  alt_text    VARCHAR(500)  NOT NULL DEFAULT '',
  sort_order  INTEGER       NOT NULL DEFAULT 0,
  created_at  TIMESTAMP     NOT NULL
)`,
    `CREATE TABLE IF NOT EXISTS occ_migration (
  version     INTEGER       NOT NULL PRIMARY KEY,
  applied_at  TIMESTAMP     NOT NULL
)`,
  ],
};

/**
 * Migration 001 for MySQL / MariaDB. It differs from the shared script in
 * three ways that the shared script cannot get away with on MySQL:
 *
 * - `REFERENCES` written inline on a column is parsed and ignored, so the
 *   foreign keys (and with them `ON DELETE CASCADE` / `SET NULL`) are
 *   declared as table constraints.
 * - `TEXT` columns cannot have a literal `DEFAULT`; the repositories always
 *   supply those values, so the defaults are dropped.
 * - Timestamps are `DATETIME(3)`: MySQL 5.7 silently adds `ON UPDATE
 *   CURRENT_TIMESTAMP` to the first `TIMESTAMP` column, which would rewrite
 *   `created_at` whenever a row changes.
 */
export const mysqlInitialMigration: Migration = {
  version: 1,
  description: 'initial schema',
  statements: [
    `CREATE TABLE IF NOT EXISTS occ_category (
  id          VARCHAR(36)   NOT NULL PRIMARY KEY,
  name        VARCHAR(255)  NOT NULL,
  slug        VARCHAR(255)  NOT NULL UNIQUE,
  parent_id   VARCHAR(36)   NULL,
  metadata    TEXT          NOT NULL,
  created_at  DATETIME(3)   NOT NULL,
  updated_at  DATETIME(3)   NOT NULL,
  CONSTRAINT occ_category_parent_fk FOREIGN KEY (parent_id)
    REFERENCES occ_category (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS occ_product (
  id          VARCHAR(36)   NOT NULL PRIMARY KEY,
  name        VARCHAR(255)  NOT NULL,
  slug        VARCHAR(255)  NOT NULL UNIQUE,
  description TEXT          NOT NULL,
  price       INTEGER       NOT NULL DEFAULT 0,
  sku         VARCHAR(255)  NULL,
  category_id VARCHAR(36)   NULL,
  metadata    TEXT          NOT NULL,
  created_at  DATETIME(3)   NOT NULL,
  updated_at  DATETIME(3)   NOT NULL,
  CONSTRAINT occ_product_category_fk FOREIGN KEY (category_id)
    REFERENCES occ_category (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS occ_image (
  id          VARCHAR(36)   NOT NULL PRIMARY KEY,
  product_id  VARCHAR(36)   NOT NULL,
  url         TEXT          NOT NULL,
  alt_text    VARCHAR(500)  NOT NULL DEFAULT '',
  sort_order  INTEGER       NOT NULL DEFAULT 0,
  created_at  DATETIME(3)   NOT NULL,
  CONSTRAINT occ_image_product_fk FOREIGN KEY (product_id)
    REFERENCES occ_product (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
};
