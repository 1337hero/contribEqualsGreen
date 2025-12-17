import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, realpathSync, openSync, closeSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG_PATH = join(__dirname, 'config.json');
const STATE_PATH = join(__dirname, 'state.json');
const LOCK_PATH = join(__dirname, '.lock');

const CONFIG_VERSION = 1;
const STATE_VERSION = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function log(msg, level = 'info') {
  const prefix = { info: '→', success: '✓', error: '✗', warn: '⚠', dry: '○' };
  console.log(`${prefix[level] || '→'} ${msg}`);
}

function git(repoPath, args, opts = {}) {
  const { throwOnError = true } = opts;
  const result = spawnSync('git', ['-C', repoPath, ...args], { encoding: 'utf-8' });

  if (result.error) {
    if (throwOnError) throw result.error;
    return null;
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const error = new Error(stderr || `git ${args.join(' ')} failed with status ${result.status}`);
    error.code = result.status;
    if (throwOnError) throw error;
    return null;
  }

  return (result.stdout || '').trim();
}

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lock Management
// ─────────────────────────────────────────────────────────────────────────────

function parseLockPid(lockData) {
  const match = String(lockData).match(/pid:(\d+)/);
  if (!match) return null;
  const pid = Number(match[1]);
  return Number.isFinite(pid) ? pid : null;
}

function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  if (existsSync(LOCK_PATH)) {
    const lockData = readFileSync(LOCK_PATH, 'utf-8');
    const pid = parseLockPid(lockData);
    if (pid && !isProcessRunning(pid)) {
      log(`Stale lock detected (pid ${pid}). Removing lock.`, 'warn');
      unlinkSync(LOCK_PATH);
    } else {
      log(`Already running (lock: ${lockData}). Exiting.`, 'error');
      process.exit(1);
    }
  }

  let fd;
  try {
    fd = openSync(LOCK_PATH, 'wx');
  } catch (err) {
    if (err?.code === 'EEXIST') {
      const lockData = readFileSync(LOCK_PATH, 'utf-8');
      log(`Already running (lock: ${lockData}). Exiting.`, 'error');
      process.exit(1);
    }
    throw err;
  }

  try {
    writeFileSync(fd, `pid:${process.pid} time:${new Date().toISOString()}`);
  } finally {
    closeSync(fd);
  }
}

function releaseLock() {
  if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH);
}

// ─────────────────────────────────────────────────────────────────────────────
// Config & State
// ─────────────────────────────────────────────────────────────────────────────

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    log(`Config not found: ${CONFIG_PATH}`, 'error');
    process.exit(1);
  }

  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));

  if (config.version !== CONFIG_VERSION) {
    log(`Config version mismatch. Expected ${CONFIG_VERSION}, got ${config.version}`, 'error');
    process.exit(1);
  }

  // Validate required fields
  if (!Array.isArray(config.repos) || config.repos.length === 0) {
    log('Config must have non-empty repos array', 'error');
    process.exit(1);
  }

  if (!config.repos.every(r => typeof r === 'string' && r.length > 0)) {
    log('Config repos must be an array of non-empty strings', 'error');
    process.exit(1);
  }

  // Apply defaults
  const repoCount = config.repos.length;
  const maxReposPerRun = Number.isFinite(config.maxReposPerRun) ? Math.floor(config.maxReposPerRun) : 5;
  const requestedReposPerRun = Number.isFinite(config.reposPerRun) ? Math.floor(config.reposPerRun) : 2;
  config.reposPerRun = Math.min(Math.max(requestedReposPerRun, 1), Math.max(maxReposPerRun, 1), repoCount);

  config.method = config.method || 'empty-commit';
  if (!['empty-commit', 'heartbeat-file'].includes(config.method)) {
    log(`Unknown method: ${config.method}`, 'error');
    process.exit(1);
  }

  config.dryRun = config.dryRun ?? false;
  config.exclude = config.exclude || [];
  if (!Array.isArray(config.exclude)) {
    log('Config exclude must be an array', 'error');
    process.exit(1);
  }

  if (typeof config.targetBranch === 'string' && config.targetBranch.trim() === '') {
    config.targetBranch = null;
  }

  return config;
}

function loadState(config) {
  if (!existsSync(STATE_PATH)) {
    // Initialize fresh state with shuffled order
    return {
      version: STATE_VERSION,
      cycle: {
        order: shuffle([...Array(config.repos.length).keys()]),
        position: 0
      },
      repos: {}
    };
  }

  const state = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));

  if (state.version !== STATE_VERSION) {
    log(`State version mismatch. Resetting state.`, 'warn');
    return {
      version: STATE_VERSION,
      cycle: {
        order: shuffle([...Array(config.repos.length).keys()]),
        position: 0
      },
      repos: {}
    };
  }

  // Handle repos list size changes
  const repoCount = config.repos.length;
  if (state.cycle.order.length !== repoCount || state.cycle.order.some(i => i >= repoCount)) {
    log('Repo count changed, reshuffling cycle', 'warn');
    state.cycle.order = shuffle([...Array(repoCount).keys()]);
    state.cycle.position = 0;
  }

  return state;
}

function saveState(state) {
  const tmpPath = `${STATE_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, STATE_PATH);
}

// ─────────────────────────────────────────────────────────────────────────────
// Repo Operations
// ─────────────────────────────────────────────────────────────────────────────

function getRepoId(repoPath) {
  // Use origin URL as stable identifier
  const origin = git(repoPath, ['remote', 'get-url', 'origin'], { throwOnError: false });
  if (origin) return origin;

  // Fallback to resolved real path
  return realpathSync(repoPath);
}

function getDefaultBranch(repoPath) {
  // Try to get default branch from remote
  const remoteHead = git(repoPath, ['symbolic-ref', 'refs/remotes/origin/HEAD'], { throwOnError: false });
  if (remoteHead) {
    return remoteHead.replace('refs/remotes/origin/', '');
  }

  // Fallback: check for common branch names
  const branchesRaw = git(repoPath, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { throwOnError: false }) || '';
  const branches = branchesRaw.split('\n').map(b => b.trim()).filter(Boolean);
  if (branches.includes('main')) return 'main';
  if (branches.includes('master')) return 'master';

  // Last resort: current branch
  return git(repoPath, ['branch', '--show-current'], { throwOnError: false }) || 'main';
}

function preflight(repoPath, config) {
  const errors = [];

  // 1. Path exists?
  if (!existsSync(repoPath)) {
    return { ok: false, errors: ['Path does not exist'] };
  }

  // 2. Has .git?
  if (!existsSync(join(repoPath, '.git'))) {
    return { ok: false, errors: ['Not a git repository'] };
  }

  // 3. Has origin remote?
  const origin = git(repoPath, ['remote', 'get-url', 'origin'], { throwOnError: false });
  if (!origin) {
    errors.push('No origin remote configured');
  }

  // 4. Working tree clean?
  const status = git(repoPath, ['status', '--porcelain'], { throwOnError: false });
  if (status && status.length > 0) {
    errors.push('Working tree has uncommitted changes');
  }

  // 5. On correct branch?
  const currentBranch = git(repoPath, ['branch', '--show-current'], { throwOnError: false });
  const targetBranch = config.targetBranch || getDefaultBranch(repoPath);

  if (!currentBranch) {
    errors.push('Detached HEAD or current branch unknown');
  } else if (currentBranch !== targetBranch) {
    errors.push(`On branch '${currentBranch}', expected '${targetBranch}'`);
  }

  // 6. Check if excluded
  const repoId = getRepoId(repoPath);
  if (config.exclude.some(pattern => repoPath.includes(pattern) || repoId.includes(pattern))) {
    errors.push('Repo is in exclude list');
  }

  return { ok: errors.length === 0, errors, branch: targetBranch };
}

// ─────────────────────────────────────────────────────────────────────────────
// Commit Methods
// ─────────────────────────────────────────────────────────────────────────────

function doEmptyCommit(repoPath, branch, action, dryRun) {
  const messages = {
    'commit-a': 'heartbeat: pulse',
    'commit-b': 'heartbeat: beat'
  };
  const msg = messages[action] || 'heartbeat';

  if (dryRun) {
    log(`[DRY] Would commit: "${msg}"`, 'dry');
    log(`[DRY] Would push to origin (${branch})`, 'dry');
    return true;
  }

  git(repoPath, ['commit', '--allow-empty', '-m', msg]);
  git(repoPath, ['push', 'origin', `HEAD:${branch}`]);
  return true;
}

function doHeartbeatFile(repoPath, branch, action, dryRun) {
  const contribDir = join(repoPath, '.contrib');
  const heartbeatPath = join(contribDir, 'heartbeat.txt');

  const content = action === 'commit-a'
    ? '# Auto-generated heartbeat - do not edit\npulse\n'
    : '# Auto-generated heartbeat - do not edit\nbeat\n';

  if (dryRun) {
    log(`[DRY] Would write to ${heartbeatPath}`, 'dry');
    log(`[DRY] Would commit and push`, 'dry');
    return true;
  }

  if (!existsSync(contribDir)) {
    mkdirSync(contribDir, { recursive: true });
  }

  writeFileSync(heartbeatPath, content);
  git(repoPath, ['add', '.contrib/heartbeat.txt']);
  git(repoPath, ['commit', '-m', `heartbeat: ${action === 'commit-a' ? 'pulse' : 'beat'}`]);
  git(repoPath, ['push', 'origin', `HEAD:${branch}`]);
  return true;
}

function performCommit(repoPath, branch, action, config) {
  if (config.method === 'heartbeat-file') {
    return doHeartbeatFile(repoPath, branch, action, config.dryRun);
  }
  return doEmptyCommit(repoPath, branch, action, config.dryRun);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function selectRepos(config, state) {
  const { order, position } = state.cycle;

  if (!Array.isArray(order) || order.length === 0) return [];
  const safePosition = Math.max(0, Math.min(position || 0, order.length));
  const end = Math.min(safePosition + config.reposPerRun, order.length);
  return order.slice(safePosition, end).map(idx => ({ index: idx, path: config.repos[idx] }));
}

function advanceCycle(config, state, count) {
  state.cycle.position += count;

  // If we've completed a full cycle, reshuffle
  if (state.cycle.position >= state.cycle.order.length) {
    state.cycle.order = shuffle([...Array(config.repos.length).keys()]);
    state.cycle.position = 0;
    log('Cycle complete, reshuffled order', 'info');
  }
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  GitHub Contribution Generator');
  console.log('══════════════════════════════════════════════════════\n');

  // Acquire lock
  acquireLock();

  try {
    // Load config & state
    const config = loadConfig();
    const state = loadState(config);

    if (config.dryRun) {
      log('DRY RUN MODE - no changes will be made\n', 'warn');
    }

    log(`Method: ${config.method}`);
    log(`Repos per run: ${config.reposPerRun}`);
    log(`Total repos: ${config.repos.length}\n`);

    // Select repos for this run
    const selectedRepos = selectRepos(config, state);
    if (selectedRepos.length === 0) {
      log('No repos selected for this run (cycle exhausted). Reshuffling.', 'warn');
      if (!config.dryRun) {
        state.cycle.order = shuffle([...Array(config.repos.length).keys()]);
        state.cycle.position = 0;
      }
    } else if (selectedRepos.length < config.reposPerRun) {
      log(`Selected ${selectedRepos.length}/${config.reposPerRun} repos (end of cycle)`, 'info');
    }

    for (const { path: repoPath } of selectedRepos) {
      console.log(`\n─────────────────────────────────────────────────────`);
      log(`Processing: ${repoPath}`);

      // Preflight checks
      const check = preflight(repoPath, config);
      if (!check.ok) {
        log(`Skipping: ${check.errors.join(', ')}`, 'error');
        continue;
      }

      // Get stable repo ID
      const repoId = getRepoId(repoPath);
      log(`Repo ID: ${repoId}`);
      log(`Branch: ${check.branch}`);

      // Determine action (opposite of last)
      const lastAction = state.repos[repoId]?.lastAction ?? null;
      const nextAction = lastAction === 'commit-a' ? 'commit-b' : 'commit-a';
      log(`Last action: ${lastAction || 'none'} → Next: ${nextAction}`);

      // Perform commit
      try {
        performCommit(repoPath, check.branch, nextAction, config);

        if (!config.dryRun) {
          // Update state only on success
          state.repos[repoId] = {
            lastAction: nextAction,
            lastSuccess: new Date().toISOString(),
            failures: 0
          };
        }

        log(config.dryRun ? 'DRY RUN successful' : 'Committed and pushed successfully', config.dryRun ? 'dry' : 'success');
      } catch (err) {
        if (!config.dryRun) {
          const failures = (state.repos[repoId]?.failures || 0) + 1;
          state.repos[repoId] = {
            ...state.repos[repoId],
            failures,
            lastError: err?.message || String(err)
          };
        }
        log(`Failed: ${err?.message || String(err)}`, 'error');
      }
    }

    if (!config.dryRun) {
      // Advance cycle
      advanceCycle(config, state, selectedRepos.length);

      // Save state
      saveState(state);
      log('\nState saved', 'success');
    } else {
      log('\nDRY RUN: state not updated', 'dry');
    }

  } finally {
    releaseLock();
  }

  console.log('\n══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  log(`Fatal error: ${err.message}`, 'error');
  releaseLock();
  process.exit(1);
});
