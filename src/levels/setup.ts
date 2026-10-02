/**
 * Execute level setup steps to create the initial World.
 */
import { produce } from 'immer';
import type { HubAction, LevelDefinition, SetupStep, TeammateAction, HostedRepoSetup } from '../shared/level';
import type { PlayerProfile } from '../shared/progress';
import type { World } from '../shared/types';
import { createWorld, createMachine } from '../engine/core/world';
import { writeFile, mkdirp, deleteFile } from '../engine/core/fs';
import { resolvePath } from '../engine/core/paths';
import { runLine } from '../parser/index';
import { applyHubAction } from '../hub/index';
import { setupHostedRepo, applyTeammatePush } from '../remote/index';
import { MAIN_MACHINE_ID, DEFAULT_HOME, DEFAULT_HOST, DEFAULT_USER, DEFAULT_CLOCK } from '../shared/constants';

// ---------------------------------------------------------------------------
// Template substitution
// ---------------------------------------------------------------------------

export function substituteTemplates(text: string, player: PlayerProfile): string {
  return text
    .replace(/\{\{player\.name\}\}/g, player.name)
    .replace(/\{\{player\.email\}\}/g, player.email)
    .replace(/\{\{player\.handle\}\}/g, player.handle);
}

export function substituteLevel(level: LevelDefinition, player: PlayerProfile): LevelDefinition {
  // Deep clone and substitute all string values
  const json = JSON.stringify(level);
  const substituted = substituteTemplates(json, player);
  return JSON.parse(substituted) as LevelDefinition;
}

// ---------------------------------------------------------------------------
// Resolve path relative to machine cwd / level workdir
// ---------------------------------------------------------------------------

function resolveLevelPath(world: World, machineId: string, path: string, _workdir: string): string {
  const machine = world.machines[machineId];
  if (!machine) return path;
  return resolvePath(machine.cwd, machine.home, path);
}

// ---------------------------------------------------------------------------
// Run setup
// ---------------------------------------------------------------------------

export interface SetupResult {
  world: World;
  errors: string[];
}

export function runSetup(level: LevelDefinition, player: PlayerProfile): SetupResult {
  const errors: string[] = [];
  const setup = level.setup;
  const workdir = level.workdir ?? '~';

  // Create the main machine
  const machineOpts = setup.machine ?? {};
  const machine = createMachine({
    id: MAIN_MACHINE_ID,
    label: machineOpts.label ?? 'Your laptop',
    user: machineOpts.user ?? DEFAULT_USER,
    host: machineOpts.host ?? DEFAULT_HOST,
    home: machineOpts.home ?? DEFAULT_HOME,
    cwd: machineOpts.cwd,
    globalConfig: { ...(machineOpts.globalConfig ?? {}) },
  });

  // Set player identity by default
  const identity = machineOpts.identity !== false;
  if (identity) {
    machine.globalConfig['user.name'] = player.name;
    machine.globalConfig['user.email'] = player.email;
  }

  let world = createWorld({
    clock: setup.clock ?? DEFAULT_CLOCK,
    machines: [machine],
    hubViewer: player.handle,
    hubViewerName: player.name,
  });

  // Add hub users
  if (setup.hub?.users) {
    world = produce(world, (draft) => {
      for (const u of setup.hub!.users!) {
        draft.hub.users[u.login] = {
          login: u.login,
          name: u.name,
          color: u.color ?? '#888888',
          bot: u.bot,
        };
      }
    });
  }

  // Resolve workdir for the main machine
  const resolvedWorkdir = resolveLevelPath(world, MAIN_MACHINE_ID, workdir, '');

  // Set cwd to workdir if not explicitly set
  if (!machineOpts.cwd) {
    world = produce(world, (draft) => {
      const m = draft.machines[MAIN_MACHINE_ID];
      m.cwd = resolvedWorkdir;
      mkdirp(m.fs, resolvedWorkdir);
    });
  }

  // Execute setup steps
  for (let i = 0; i < setup.steps.length; i++) {
    const step = setup.steps[i];
    const result = executeSetupStep(world, step, resolvedWorkdir, errors);
    world = result;
  }

  // Set final cwd if specified
  if (setup.cwd) {
    const finalCwd = resolveLevelPath(world, MAIN_MACHINE_ID, setup.cwd, resolvedWorkdir);
    world = produce(world, (draft) => {
      draft.machines[MAIN_MACHINE_ID].cwd = finalCwd;
      mkdirp(draft.machines[MAIN_MACHINE_ID].fs, finalCwd);
    });
  }

  return { world, errors };
}

function executeSetupStep(world: World, step: SetupStep, workdir: string, errors: string[]): World {
  if ('run' in step && typeof step.run === 'string') {
    const machineId = (step as { machine?: string }).machine ?? MAIN_MACHINE_ID;
    const result = runLine(world, machineId, step.run);
    if (result.exitCode !== 0 && !(step as { expectFail?: boolean }).expectFail) {
      errors.push(`Setup step "run: ${step.run}" failed with exit code ${result.exitCode}`);
    }
    return result.state;
  }

  if ('files' in step && typeof step.files === 'object' && step.files !== null && !('commit' in step.files)) {
    const machineId = (step as { machine?: string }).machine ?? MAIN_MACHINE_ID;
    return produce(world, (draft) => {
      const m = draft.machines[machineId];
      if (!m) { errors.push(`Machine '${machineId}' not found`); return; }
      for (const [path, content] of Object.entries(step.files as Record<string, string>)) {
        const absPath = resolveLevelPath(world, machineId, path, workdir);
        writeFile(m.fs, absPath, content);
      }
    });
  }

  if ('delete' in step) {
    const machineId = (step as { machine?: string }).machine ?? MAIN_MACHINE_ID;
    return produce(world, (draft) => {
      const m = draft.machines[machineId];
      if (!m) return;
      for (const path of (step as { delete: string[] }).delete) {
        const absPath = resolveLevelPath(world, machineId, path, workdir);
        deleteFile(m.fs, absPath);
      }
    });
  }

  if ('mkdir' in step) {
    const machineId = (step as { machine?: string }).machine ?? MAIN_MACHINE_ID;
    return produce(world, (draft) => {
      const m = draft.machines[machineId];
      if (!m) return;
      for (const path of (step as { mkdir: string[] }).mkdir) {
        const absPath = resolveLevelPath(world, machineId, path, workdir);
        mkdirp(m.fs, absPath);
      }
    });
  }

  if ('commit' in step) {
    const machineId = (step as { machine?: string }).machine ?? MAIN_MACHINE_ID;
    const commitStep = (step as { commit: { message: string; files?: Record<string, string | null>; author?: string } }).commit;
    let w = world;

    // Write/delete files
    if (commitStep.files) {
      w = produce(w, (draft) => {
        const m = draft.machines[machineId];
        if (!m) return;
        for (const [path, content] of Object.entries(commitStep.files!)) {
          const absPath = resolveLevelPath(world, machineId, path, workdir);
          if (content === null) {
            deleteFile(m.fs, absPath);
          } else {
            writeFile(m.fs, absPath, content);
          }
        }
      });
    }

    // git add -A
    const addResult = runLine(w, machineId, 'git add -A');
    w = addResult.state;

    // git commit
    let commitCmd = `git commit -m "${commitStep.message.replace(/"/g, '\\"')}"`;
    if (commitStep.author) {
      commitCmd += ` --author="${commitStep.author}"`;
    }
    const commitResult = runLine(w, machineId, commitCmd);
    if (commitResult.exitCode !== 0) {
      errors.push(`Setup step "commit: ${commitStep.message}" failed`);
    }
    return commitResult.state;
  }

  if ('hosted' in step) {
    const hostedSetup = (step as { hosted: typeof step extends { hosted: infer H } ? H : never }).hosted;
    // Find the default local repo for fromLocal
    const defaultMachine = MAIN_MACHINE_ID;
    const machine = world.machines[defaultMachine];
    const defaultRepoPath = machine?.cwd ?? workdir;

    const result = setupHostedRepo(world, hostedSetup as HostedRepoSetup, {
      machine: defaultMachine,
      repoPath: defaultRepoPath,
    });
    if (result.exitCode !== 0) {
      errors.push(`Setup hosted repo failed: ${result.output.map((l) => l.text).join(' ')}`);
    }
    return result.state;
  }

  if ('teammate' in step) {
    const action = (step as { teammate: TeammateAction }).teammate;
    if (action.type === 'push') {
      const result = applyTeammatePush(world, action);
      if (result.exitCode !== 0) {
        errors.push(`Teammate push failed: ${result.output.map((l) => l.text).join(' ')}`);
      }
      return result.state;
    }
    if (action.type === 'hub') {
      const result = applyHubAction(world, action.action);
      if (result.exitCode !== 0) {
        errors.push(`Teammate hub action failed: ${result.output.map((l) => l.text).join(' ')}`);
      }
      return result.state;
    }
    if (action.type === 'say') {
      // Dialogue — nothing to change in the world
      return world;
    }
    if (action.type === 'run') {
      const result = runLine(world, action.machine, action.line);
      if (result.exitCode !== 0) {
        errors.push(`Teammate run failed: ${result.output.map((l) => l.text).join(' ')}`);
      }
      return result.state;
    }
    return world;
  }

  if ('hub' in step) {
    const action = (step as { hub: HubAction }).hub;
    const result = applyHubAction(world, action);
    if (result.exitCode !== 0) {
      errors.push(`Hub action failed: ${result.output.map((l) => l.text).join(' ')}`);
    }
    return result.state;
  }

  if ('machineAdd' in step) {
    const setup = (step as { machineAdd: { id: string; label?: string; user?: string; host?: string; home?: string; cwd?: string; globalConfig?: Record<string, string>; identity?: boolean } }).machineAdd;
    return produce(world, (draft) => {
      const m = createMachine({
        id: setup.id,
        label: setup.label,
        user: setup.user,
        host: setup.host,
        home: setup.home,
        cwd: setup.cwd,
        globalConfig: setup.globalConfig,
      });
      if (setup.identity !== false) {
        // Get player info from the existing hub
        const viewer = draft.hub.viewer;
        const viewerUser = draft.hub.users[viewer];
        if (viewerUser) {
          m.globalConfig['user.name'] = viewerUser.name;
          m.globalConfig['user.email'] = `${viewer}@users.noreply.github.com`;
        }
      }
      draft.machines[setup.id] = m;
    });
  }

  if ('switchMachine' in step) {
    const machineId = (step as { switchMachine: string }).switchMachine;
    return produce(world, (draft) => {
      if (draft.machines[machineId]) {
        draft.activeMachine = machineId;
      } else {
        errors.push(`Machine '${machineId}' not found`);
      }
    });
  }

  if ('advanceClock' in step) {
    const seconds = (step as { advanceClock: number }).advanceClock;
    return produce(world, (draft) => {
      draft.clock += seconds;
    });
  }

  errors.push(`Unknown setup step: ${JSON.stringify(step)}`);
  return world;
}
