import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entryFiles = ['zhiluwujie.html', 'zhiluwujie_backup.html'];

describe('legacy realtime entry connection configuration', () => {
  it.each(entryFiles)('keeps %s on the shared realtime endpoint rules', (entryFile) => {
    const source = readFileSync(resolve(frontendDir, 'public', entryFile), 'utf8');
    const connectionBlock = source.slice(
      source.indexOf('function connectWS()'),
      source.indexOf('function disconnectWS()'),
    );

    expect(connectionBlock).not.toContain('localhost:8000');
    expect(connectionBlock).toContain("let wsUrl = 'ws://localhost:8011/api/v1/realtime/ws';");
    expect(connectionBlock).toContain('parsed?.state?.cloudApiBaseUrl');
    expect(connectionBlock).toContain('new URL(configuredApiBaseUrl)');
    expect(connectionBlock).toContain("parsedBaseUrl.protocol === 'https:' ? 'wss:' : 'ws:'");
  });
});
