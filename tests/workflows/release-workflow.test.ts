import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowPath = resolve(process.cwd(), '.github/workflows/release.yml');

function job(workflow: string, name: string): string {
  const match = workflow.match(
    new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z][a-z-]*:|(?![\\s\\S]))`, 'm'),
  );

  if (!match) {
    throw new Error(`Release workflow is missing the ${name} job.`);
  }

  return match[0];
}

describe('release workflow privilege separation', () => {
  it('keeps dependency execution in the read-only build job', async () => {
    const workflow = await readFile(workflowPath, 'utf8');
    const build = job(workflow, 'build');

    expect(build).toContain('permissions:\n      contents: read');
    expect(build).toContain('run: npm ci');
    expect(build).not.toContain('id-token: write');
    expect(build).not.toContain('attestations: write');
    expect(build).not.toContain('contents: write');
    expect(build).toContain('.github/release-notes/${{ github.ref_name }}.md');
  });

  it('attests only the three public release assets in an isolated job', async () => {
    const workflow = await readFile(workflowPath, 'utf8');
    const attest = job(workflow, 'attest');

    expect(attest).toContain('needs: build');
    expect(attest).toContain('contents: read');
    expect(attest).toContain('id-token: write');
    expect(attest).toContain('attestations: write');
    expect(attest).not.toContain('contents: write');
    expect(attest).not.toContain('run:');
    expect(attest).toContain(
      'uses: actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6 # v4.2.2',
    );
    expect(attest).toContain('subject-path: |\n            main.js\n            manifest.json\n            styles.css');
    expect(attest).not.toContain('.github/release-notes');
  });

  it('publishes only after attestation succeeds', async () => {
    const workflow = await readFile(workflowPath, 'utf8');
    const publish = job(workflow, 'publish');

    expect(publish).toContain('needs: attest');
    expect(publish).toContain('permissions:\n      contents: write');
    expect(publish).not.toContain('id-token: write');
    expect(publish).not.toContain('attestations: write');
    expect(publish).toContain('name: release-${{ github.ref_name }}');
    expect(publish).toContain('--notes-file ".github/release-notes/$RELEASE_TAG.md"');
  });
});
