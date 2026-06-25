/**
 * A product category. Categories are hierarchical: a category may have a
 * `parentId` pointing to another category.
 */
export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for creating a new category. */
export interface CreateCategoryInput {
  name: string;
  slug?: string;
  parentId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Fields that may be updated on an existing category. */
export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  parentId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Filters for listing categories. */
export interface CategoryFilter {
  parentId?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
}
