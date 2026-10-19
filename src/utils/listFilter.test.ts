import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  resolveCategoryFilter,
  resolveProductFilter,
} from './listFilter.js';

describe('resolveProductFilter', () => {
  it('applies the default page size', () => {
    expect(resolveProductFilter()).toMatchObject({
      limit: DEFAULT_LIST_LIMIT,
      offset: 0,
    });
  });

  it('keeps valid values and treats an empty search as none', () => {
    expect(
      resolveProductFilter({
        categoryId: null,
        search: '',
        minPrice: 0,
        maxPrice: 500,
        limit: MAX_LIST_LIMIT,
        offset: 20,
      }),
    ).toEqual({
      categoryId: null,
      search: undefined,
      minPrice: 0,
      maxPrice: 500,
      limit: MAX_LIST_LIMIT,
      offset: 20,
    });
  });

  it('allows limit 0', () => {
    expect(resolveProductFilter({ limit: 0 }).limit).toBe(0);
  });

  it('names the invalid field and what it received', () => {
    expect(() => resolveProductFilter({ limit: -3 })).toThrow(
      'Invalid limit filter: expected an integer from 0 to 1000, received -3.',
    );
    expect(() =>
      resolveProductFilter({ categoryId: { $ne: null } as never }),
    ).toThrow(
      'Invalid categoryId filter: expected a string, null or undefined, received object.',
    );
  });

  it('rejects an over-long search', () => {
    expect(() => resolveProductFilter({ search: 'a'.repeat(201) })).toThrow(
      'Invalid search filter',
    );
  });
});

describe('resolveCategoryFilter', () => {
  it('validates parentId and pagination', () => {
    expect(resolveCategoryFilter({ parentId: 'p', limit: 5 })).toMatchObject({
      parentId: 'p',
      limit: 5,
    });
    expect(() => resolveCategoryFilter({ offset: -1 })).toThrow(
      'Invalid offset filter',
    );
  });
});
