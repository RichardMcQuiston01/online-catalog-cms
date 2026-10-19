import { describe, expect, it } from 'bun:test';
import { ValidationError } from '../errors.js';
import type { ProductRepository } from '../interfaces/index.js';
import { document, link, paragraph, text } from '../rich-text/builders.js';
import { ProductService } from './ProductService.js';

function createRepo(): ProductRepository & { writes: number } {
  const repo = {
    writes: 0,
    create: async () => {
      repo.writes += 1;
      return {} as never;
    },
    update: async () => {
      repo.writes += 1;
      return {} as never;
    },
    get: async () => null,
    getBySlug: async () => null,
    delete: async () => {},
    list: async () => [],
  };
  return repo;
}

const unsafeDescription = document([
  paragraph([link('javascript:alert(1)', [text('click')])]),
]);

describe('ProductService description validation', () => {
  it('rejects an unsafe description on create', async () => {
    const repo = createRepo();
    const service = new ProductService(repo);

    await expect(
      service.create({ name: 'A', price: 1, description: unsafeDescription }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.writes).toBe(0);
  });

  it('rejects a malformed description on update', async () => {
    const repo = createRepo();
    const service = new ProductService(repo);

    const error = await service
      .update('id', { description: { version: 2 } as never })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe('description');
    expect((error as ValidationError).message).toContain('"version" must be 1');
    expect(repo.writes).toBe(0);
  });

  it('leaves an update without a description alone', async () => {
    const repo = createRepo();
    await new ProductService(repo).update('id', { price: 5 });
    expect(repo.writes).toBe(1);
  });
});
