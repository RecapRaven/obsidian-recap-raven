import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowPath = resolve(process.cwd(), '.github/workflows/owner-maintained.yml');
const ciPath = resolve(process.cwd(), '.github/workflows/ci.yml');
const securityPath = resolve(process.cwd(), '.github/workflows/security.yml');

describe('owner-maintained pull-request workflow', () => {
  it('runs from trusted base metadata and never checks out or executes contributed code', async () => {
    const workflow = await readFile(workflowPath, 'utf8');

    expect(workflow).toContain('pull_request_target:');
    expect(workflow).not.toContain('actions/checkout');
    expect(workflow).not.toMatch(/^\s+run:/mu);
    expect(workflow).toContain('permissions:\n  contents: read');
  });

  it('allows only the owner and Dependabot pull requests to remain open', async () => {
    const workflow = await readFile(workflowPath, 'utf8');

    expect(workflow).toContain(
      "if: github.event.pull_request.user.login != 'rknaggs' && github.event.pull_request.user.login != 'dependabot[bot]'",
    );
    expect(workflow).toContain('issues: write');
    expect(workflow).toContain('pull-requests: write');
    expect(workflow).toContain(
      'uses: actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd # v8.0.0',
    );
    expect(workflow).toContain("state: 'closed'");
  });

  it('explains the policy diplomatically and sends proposals to issues', async () => {
    const workflow = await readFile(workflowPath, 'utf8');

    expect(workflow).toContain('Thank you for taking the time to propose a change.');
    expect(workflow).toContain('Please open an issue describing the problem or proposed improvement.');
    expect(workflow).toContain('without running contributed code');
  });

  it('prevents external pull-request code from entering CI or security jobs', async () => {
    const ci = await readFile(ciPath, 'utf8');
    const security = await readFile(securityPath, 'utf8');
    const allowedPullRequest =
      "github.event.pull_request.user.login == 'rknaggs' || github.event.pull_request.user.login == 'dependabot[bot]'";

    expect(ci).toContain('pull_request_target:');
    expect(ci).not.toMatch(/^\s+pull_request:\s*$/mu);
    expect(ci).toContain(`if: github.event_name != 'pull_request_target' || ${allowedPullRequest}`);
    expect(ci).toContain("ref: ${{ github.event_name == 'pull_request_target'");
    expect(ci).toContain('.github/workflows/owner-maintained.yml');
    expect(ci).toContain('statuses: write');
    expect(ci).toContain('sha: context.payload.pull_request.head.sha');
    expect(ci).toContain("context: 'check'");

    expect(security).toContain('pull_request_target:');
    expect(security).not.toMatch(/^\s+pull_request:\s*$/mu);
    expect(security.split(allowedPullRequest)).toHaveLength(6);
    expect(security.split('github.event.pull_request.head.sha')).toHaveLength(5);
    expect(security).toContain('statuses: write');
    expect(security).toContain('sha: context.payload.pull_request.head.sha');
    expect(security).toContain("'dependency-review':");
    expect(security).toContain("'dependency-audit':");
    expect(security).toContain("codeql:");
    expect(security).toContain("gitleaks:");
  });

  it('keeps status-writing jobs isolated from pull-request code', async () => {
    const ci = await readFile(ciPath, 'utf8');
    const security = await readFile(securityPath, 'utf8');
    const ciRecorder = ci.slice(ci.indexOf('  record-pr-check:'));
    const securityRecorder = security.slice(security.indexOf('  record-pr-checks:'));

    for (const recorder of [ciRecorder, securityRecorder]) {
      expect(recorder).not.toContain('actions/checkout');
      expect(recorder).not.toMatch(/^\s+run:/mu);
      expect(recorder).toContain(
        'uses: actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd # v8.0.0',
      );
    }
  });
});
