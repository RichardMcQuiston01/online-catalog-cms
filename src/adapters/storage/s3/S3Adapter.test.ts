import { describe, expect, it } from 'bun:test';
import { S3Adapter, type S3Config } from './S3Adapter.js';

const baseConfig: S3Config = {
  bucket: 'catalog',
  region: 'us-east-1',
  accessKeyId: 'test',
  secretAccessKey: 'test',
};

interface PutInput {
  ACL?: string;
  Key: string;
  ContentType: string;
}

/** Builds an adapter whose client records the commands instead of sending them. */
function createRecordingAdapter(config: Partial<S3Config> = {}): {
  adapter: S3Adapter;
  sent: PutInput[];
} {
  const adapter = new S3Adapter({ ...baseConfig, ...config });
  const sent: PutInput[] = [];
  (adapter as unknown as { client: { send: (c: unknown) => unknown } }).client =
    {
      send: async (command: unknown) => {
        sent.push((command as { input: PutInput }).input);
      },
    };
  return { adapter, sent };
}

describe('S3Adapter access control', () => {
  it('uploads without an ACL by default', async () => {
    const { adapter, sent } = createRecordingAdapter();
    await adapter.upload(Buffer.from('x'), 'a.png');
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toHaveProperty('ACL');
  });

  it('sends public-read when publicRead is enabled', async () => {
    const { adapter, sent } = createRecordingAdapter({ publicRead: true });
    await adapter.upload(Buffer.from('x'), 'a.png');
    expect(sent[0]?.ACL).toBe('public-read');
  });

  it('lets a single upload opt in or out', async () => {
    const optIn = createRecordingAdapter();
    await optIn.adapter.upload(Buffer.from('x'), 'a.png', { public: true });
    expect(optIn.sent[0]?.ACL).toBe('public-read');

    const optOut = createRecordingAdapter({ publicRead: true });
    await optOut.adapter.upload(Buffer.from('x'), 'a.png', { public: false });
    expect(optOut.sent[0]).not.toHaveProperty('ACL');
  });
});
