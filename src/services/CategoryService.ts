import type { CategoryRepository } from '../interfaces/index.js';
import type {
  Category,
  CategoryFilter,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../types/index.js';

/** High-level category operations. */
export class CategoryService {
  constructor(private readonly repo: CategoryRepository) {}

  async create(input: CreateCategoryInput): Promise<Category> {
    return this.repo.create(input);
  }

  async get(id: string): Promise<Category | null> {
    return this.repo.get(id);
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    return this.repo.update(id, input);
  }

  async delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  async list(filter?: CategoryFilter): Promise<Category[]> {
    return this.repo.list(filter);
  }
}
