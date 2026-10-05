import { describe, expect, test } from 'bun:test';
import * as browserEntry from './browser.js';
import * as fullEntry from './index.js';

const serverAdapterNames: string[] = [
  'SQLiteAdapter',
  'PostgresAdapter',
  'MySQLAdapter',
  'RedisAdapter',
  'MongoDBAdapter',
  'LocalStorageAdapter',
  'S3Adapter',
];

describe('browser entry point', () => {
  test('exports the platform-neutral core', () => {
    for (const name of [
      'OnlineCatalog',
      'ProductService',
      'CategoryService',
      'ImageService',
      'Installer',
      'ExternalURLAdapter',
      'assertRichTextDocument',
      'isRichTextDocument',
      'document',
      'paragraph',
      'text',
    ]) {
      expect(browserEntry).toHaveProperty(name);
    }
  });

  test('does not export any server-only adapter', () => {
    for (const name of serverAdapterNames) {
      expect(browserEntry).not.toHaveProperty(name);
    }
  });
});

describe('full entry point', () => {
  test('exports everything the browser entry point does', () => {
    for (const name of Object.keys(browserEntry)) {
      expect(fullEntry).toHaveProperty(name);
    }
  });

  test('also exports every database and storage adapter', () => {
    for (const name of serverAdapterNames) {
      expect(fullEntry).toHaveProperty(name);
    }
  });
});
