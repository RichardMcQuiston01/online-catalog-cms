/**
 * Platform-neutral entry point (`@richardmcquiston01/online-catalog-cms`
 * under the `browser` export condition).
 *
 * Contains everything that runs in any JavaScript runtime. It deliberately
 * excludes the database and storage adapters, which depend on Node built-ins
 * (`node:fs`, `node:module`, ...). Bring your own `DatabaseAdapter`, or import
 * a server adapter from its subpath (e.g. `.../sqlite`) in Node, Bun or Deno.
 *
 * Nothing exported from here may import a Node built-in at runtime. Type-only
 * imports are fine because they are erased at build time. `bun run smoke:dist`
 * enforces this against the built output.
 */
export * from './types/index.js';
export * from './interfaces/index.js';
export * from './rich-text/index.js';

export { OnlineCatalog } from './catalog.js';
export type { OnlineCatalogConfig } from './catalog.js';
export { ProductService } from './services/ProductService.js';
export { CategoryService } from './services/CategoryService.js';
export { ImageService } from './services/ImageService.js';
export type { UploadImageInput } from './services/ImageService.js';

export { Installer } from './installer/Installer.js';
export type { InstallOptions } from './installer/Installer.js';

// Storage adapter for catalogs whose images are hosted elsewhere. It only
// passes URLs through, so it needs no Node built-ins.
export { ExternalURLAdapter } from './adapters/storage/external/ExternalURLAdapter.js';
