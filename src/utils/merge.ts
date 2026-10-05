import type { Category, UpdateCategoryInput } from '../types/category.js';
import type { Product, UpdateProductInput } from '../types/product.js';

export type ProductFields = Pick<
  Product,
  'name' | 'slug' | 'description' | 'price' | 'sku' | 'categoryId' | 'metadata'
>;

export type CategoryFields = Pick<
  Category,
  'name' | 'slug' | 'parentId' | 'metadata'
>;

/**
 * Applies a partial update over an existing product. An omitted field keeps
 * its value; `null` is a real value for nullable fields (`sku`, `categoryId`)
 * and clears them.
 */
export function mergeProductUpdate(
  existing: Product,
  input: UpdateProductInput,
): ProductFields {
  return {
    name: input.name ?? existing.name,
    slug: input.slug ?? existing.slug,
    description: input.description ?? existing.description,
    price: input.price ?? existing.price,
    sku: input.sku !== undefined ? input.sku : existing.sku,
    categoryId:
      input.categoryId !== undefined ? input.categoryId : existing.categoryId,
    metadata: input.metadata ?? existing.metadata,
  };
}

/** Category counterpart of {@link mergeProductUpdate}. */
export function mergeCategoryUpdate(
  existing: Category,
  input: UpdateCategoryInput,
): CategoryFields {
  return {
    name: input.name ?? existing.name,
    slug: input.slug ?? existing.slug,
    parentId: input.parentId !== undefined ? input.parentId : existing.parentId,
    metadata: input.metadata ?? existing.metadata,
  };
}
