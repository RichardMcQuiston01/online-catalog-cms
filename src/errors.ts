/**
 * Thrown when input fails validation, before anything is written. `field`
 * names the offending input property when one applies.
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Thrown when a slug is already used by another product or category. */
export class SlugConflictError extends ValidationError {
  constructor(readonly slug: string) {
    super(
      `The slug "${slug}" is already in use. Choose a different slug, or omit it to have one generated from the name.`,
      'slug',
    );
    this.name = 'SlugConflictError';
  }
}
