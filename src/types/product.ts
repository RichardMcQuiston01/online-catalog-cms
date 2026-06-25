import type { Image } from './image.js';
import type { RichTextDocument } from './rich-text.js';

/**
 * A catalog product. `price` is stored in the smallest currency unit
 * (e.g. cents) to avoid floating-point rounding issues.
 */
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: RichTextDocument;
  /** Price in smallest currency unit (e.g. cents). */
  price: number;
  sku: string | null;
  categoryId: string | null;
  images: Image[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for creating a new product. */
export interface CreateProductInput {
  name: string;
  description: RichTextDocument;
  price: number;
  slug?: string;
  sku?: string | null;
  categoryId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Fields that may be updated on an existing product. */
export interface UpdateProductInput {
  name?: string;
  slug?: string;
  description?: RichTextDocument;
  price?: number;
  sku?: string | null;
  categoryId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Filters for listing products. */
export interface ProductFilter {
  categoryId?: string | null;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  offset?: number;
}
