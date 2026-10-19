import { ValidationError } from '../errors.js';
import type { CategoryRepository } from '../interfaces/index.js';
import type {
  Category,
  CategoryFilter,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../types/index.js';
import {
  MAX_NAME_LENGTH,
  assertSlugAvailable,
  assertText,
  chooseSlug,
  normalizeMetadata,
} from './rules.js';

/** Most ancestors followed when checking for a cycle, as a runaway guard. */
const MAX_ANCESTOR_DEPTH = 10_000;

/**
 * High-level category operations. Owns the domain rules: slug policy, length
 * and metadata checks, and that the parent exists and never closes a cycle.
 * All validation failures are {@link ValidationError}s.
 */
export class CategoryService {
  constructor(private readonly repo: CategoryRepository) {}

  async create(input: CreateCategoryInput): Promise<Category> {
    const name = assertText('name', input.name, MAX_NAME_LENGTH);
    const metadata =
      input.metadata === undefined
        ? undefined
        : normalizeMetadata(input.metadata);
    // A new category has no children, so it cannot close a cycle.
    await this.assertParentAllowed(input.parentId, undefined);
    const slug = await chooseSlug(name, input.slug, (candidate) =>
      this.repo.getBySlug(candidate),
    );

    return this.repo.create({ ...input, name, metadata, slug });
  }

  async get(id: string): Promise<Category | null> {
    return this.repo.get(id);
  }

  /** Finds a category by its URL slug, or null. */
  async getBySlug(slug: string): Promise<Category | null> {
    return this.repo.getBySlug(slug);
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const changes: UpdateCategoryInput = { ...input };
    if (input.name !== undefined) {
      changes.name = assertText('name', input.name, MAX_NAME_LENGTH);
    }
    if (input.metadata !== undefined) {
      changes.metadata = normalizeMetadata(input.metadata);
    }
    await this.assertParentAllowed(input.parentId, id);
    if (input.slug !== undefined) {
      await assertSlugAvailable(
        input.slug,
        (candidate) => this.repo.getBySlug(candidate),
        id,
      );
    }

    return this.repo.update(id, changes);
  }

  async delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  async list(filter?: CategoryFilter): Promise<Category[]> {
    return this.repo.list(filter);
  }

  /**
   * Checks that `parentId` exists and is not the category itself or one of
   * its descendants, by walking up from the parent. `categoryId` is undefined
   * for a category that is not created yet.
   */
  private async assertParentAllowed(
    parentId: string | null | undefined,
    categoryId: string | undefined,
  ): Promise<void> {
    if (parentId === undefined || parentId === null) return;
    if (typeof parentId !== 'string') {
      throw new ValidationError(
        `parentId must be a string or null, received ${typeof parentId}.`,
        'parentId',
      );
    }
    if (parentId === categoryId) {
      throw new ValidationError(
        `A category cannot be its own parent (${parentId}).`,
        'parentId',
      );
    }

    let current: Category | null = await this.repo.get(parentId);
    if (!current) {
      throw new ValidationError(
        `Parent category not found: ${parentId}. Create the parent first, or pass parentId: null.`,
        'parentId',
      );
    }

    const visited = new Set<string>();
    while (current?.parentId && visited.size < MAX_ANCESTOR_DEPTH) {
      if (current.parentId === categoryId) {
        throw new ValidationError(
          `Setting parentId to ${parentId} would make category ${categoryId} its own ancestor (it is already a descendant of ${categoryId}).`,
          'parentId',
        );
      }
      if (visited.has(current.id)) break; // an existing cycle: stop walking
      visited.add(current.id);
      current = await this.repo.get(current.parentId);
    }
  }
}
