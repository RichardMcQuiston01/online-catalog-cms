import type {
  DatabaseAdapter,
  VerificationResult,
} from '../interfaces/DatabaseAdapter.js';

export interface InstallOptions {
  /** If true, describe what would happen without making changes. */
  dryRun?: boolean;
}

/** Wraps adapter initialization and verification with helpful logging. */
export class Installer {
  constructor(private readonly adapter: DatabaseAdapter) {}

  /**
   * Run database migrations and verify the resulting schema.
   * @returns The verification result after migration.
   */
  async install(options: InstallOptions = {}): Promise<VerificationResult> {
    if (options.dryRun) {
      return this.adapter.verify();
    }

    await this.adapter.initialize();
    return this.adapter.verify();
  }

  /** Check that the schema is correct without running migrations. */
  async verify(): Promise<VerificationResult> {
    return this.adapter.verify();
  }
}
