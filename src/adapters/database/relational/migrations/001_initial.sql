-- Migration 001: initial schema

CREATE TABLE IF NOT EXISTS occ_category (
  id          VARCHAR(36)   NOT NULL PRIMARY KEY,
  name        VARCHAR(255)  NOT NULL,
  slug        VARCHAR(255)  NOT NULL UNIQUE,
  parent_id   VARCHAR(36)   NULL REFERENCES occ_category(id) ON DELETE SET NULL,
  metadata    TEXT          NOT NULL DEFAULT '{}',
  created_at  TIMESTAMP     NOT NULL,
  updated_at  TIMESTAMP     NOT NULL
);

CREATE TABLE IF NOT EXISTS occ_product (
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
);

CREATE TABLE IF NOT EXISTS occ_image (
  id          VARCHAR(36)   NOT NULL PRIMARY KEY,
  product_id  VARCHAR(36)   NOT NULL REFERENCES occ_product(id) ON DELETE CASCADE,
  url         TEXT          NOT NULL,
  alt_text    VARCHAR(500)  NOT NULL DEFAULT '',
  sort_order  INTEGER       NOT NULL DEFAULT 0,
  created_at  TIMESTAMP     NOT NULL
);

CREATE TABLE IF NOT EXISTS occ_migration (
  version     INTEGER       NOT NULL PRIMARY KEY,
  applied_at  TIMESTAMP     NOT NULL
);

INSERT INTO occ_migration (version, applied_at) VALUES (1, CURRENT_TIMESTAMP)
  ON CONFLICT (version) DO NOTHING;
