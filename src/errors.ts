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
