import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const checker = fileURLToPath(new URL('./assert-remote-public-safety.ps1', import.meta.url));

test('remote checker accepts only explicit absence after a response-less exception', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'remote-public-safety-'));
  let status = 404;
  let fallbackReached = false;
  const server = createServer((request, response) => {
    fallbackReached = true;
    if (status === 0) return request.socket.destroy();
    response.writeHead(status);
    response.end();
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const harness = join(directory, 'invoke-checker.ps1');
    const policy = join(directory, 'policy.json');
    // Inject the observed PowerShell transport exception at the CLI boundary;
    // the fallback must use real curl against the loopback HTTP server.
    await writeFile(harness, `param([string]$Checker, [uri]$BaseUrl, [string]$PolicyPath)
function Invoke-WebRequest {
    param([uri]$Uri)
    if ($Uri.AbsolutePath -eq '/private') {
        throw [System.InvalidOperationException]::new('fixture transport exception without Response')
    }
    return [pscustomobject]@{ StatusCode = 200; Content = 'safe public content' }
}
try { & $Checker -BaseUrl $BaseUrl -PolicyPath $PolicyPath }
catch { Write-Error $_; exit 1 }
`);
    await writeFile(policy, JSON.stringify({ publicationMode: 'public-only', localSmokePaths: ['/'], remoteForbiddenPaths: ['/private'], remoteForbiddenMarkers: [] }));
    const shells = process.platform === 'win32' ? ['powershell', 'pwsh'] : ['pwsh'];
    for (const shell of shells) {
      for (status of [404, 410, 200, 302, 500, 0]) {
        fallbackReached = false;
        const result = await new Promise((resolve, reject) => {
          const child = spawn(shell, ['-NoProfile', '-File', harness, '-Checker', checker, '-BaseUrl', baseUrl, '-PolicyPath', policy], { windowsHide: true, timeout: 25_000 });
          let output = '';
          child.stdout.on('data', data => { output += data; });
          child.stderr.on('data', data => { output += data; });
          child.on('error', reject);
          child.on('close', code => resolve({ code, output }));
        });
        assert.equal(fallbackReached, true, `${shell}, HTTP ${status}: ${result.output}`);
        assert.equal(result.code === 0, [404, 410].includes(status), `${shell}, HTTP ${status}: ${result.output}`);
      }
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
