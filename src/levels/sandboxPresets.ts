/**
 * Starting worlds for the sandbox, built with the real engine.
 *
 * The `team-up` preset matters most: its base commits are written with a FIXED
 * identity and the fixed clock, so every student's starting commit has the
 * same hash on every machine. That shared ancestor is what lets two students
 * exchange repo bundles and get a mergeable divergence instead of
 * "refusing to merge unrelated histories".
 */
import { produce } from 'immer';
import { createWorld } from '../engine/core/world';
import { runLine } from '../parser';
import { setupHostedRepo } from '../remote/index';
import { MAIN_MACHINE_ID, DEFAULT_CLOCK } from '../shared/constants';
import type { PlayerProfile } from '../shared/progress';
import type { World } from '../shared/types';

export type SandboxPreset = 'empty' | 'festival' | 'festival-with-remote' | 'team-up';

/** Identity used for shared base commits. Never the player, so hashes match. */
const SHARED_AUTHOR = { name: 'Lantern Labs', email: 'team@lanternlabs.example' };

function setIdentity(world: World, name: string, email: string): World {
  return produce(world, (draft) => {
    const m = draft.machines[MAIN_MACHINE_ID];
    m.globalConfig['user.name'] = name;
    m.globalConfig['user.email'] = email;
  });
}

function run(world: World, line: string): World {
  const r = runLine(world, MAIN_MACHINE_ID, line);
  return r.state;
}

function runAll(world: World, lines: string[]): World {
  let w = world;
  for (const line of lines) w = run(w, line);
  return w;
}

export function buildSandboxWorld(preset: SandboxPreset | undefined, player: PlayerProfile): World {
  let world = createWorld({
    clock: DEFAULT_CLOCK,
    hubViewer: player.handle,
    hubViewerName: player.name,
  });

  if (!preset || preset === 'empty') {
    return setIdentity(world, player.name, player.email);
  }

  if (preset === 'team-up') {
    // Shared base: identical bytes for every student.
    world = setIdentity(world, SHARED_AUTHOR.name, SHARED_AUTHOR.email);
    world = runAll(world, [
      'mkdir festival',
      'cd festival',
      'git init',
      'echo "<h1>Lantern Festival</h1>" > index.html',
      'echo "Festival notes" > notes.txt',
      'git add -A',
      'git commit -m "Shared starting point"',
    ]);
    // From here on the student commits as themselves.
    return setIdentity(world, player.name, player.email);
  }

  // festival / festival-with-remote: a small project with some history.
  world = setIdentity(world, SHARED_AUTHOR.name, SHARED_AUTHOR.email);
  world = runAll(world, [
    'mkdir festival',
    'cd festival',
    'git init',
    'echo "<h1>Lantern Festival</h1>" > index.html',
    'git add -A',
    'git commit -m "Add homepage"',
    'echo "The Lantern Labs festival website" > README.md',
    'git add -A',
    'git commit -m "Add README"',
    'git switch -c schedule',
    'echo "<h2>Saturday</h2>" > schedule.html',
    'git add -A',
    'git commit -m "Start the schedule"',
    'git switch main',
  ]);
  world = setIdentity(world, player.name, player.email);

  if (preset === 'festival-with-remote') {
    const hosted = setupHostedRepo(
      world,
      {
        id: 'lantern-labs/festival-site',
        description: 'The Lantern Labs festival website',
        visibility: 'public',
        defaultBranch: 'main',
        collaborators: ['ada-okafor', 'sam-builds'],
        fromLocal: { setUpstream: true },
      },
      { machine: MAIN_MACHINE_ID, repoPath: `${world.machines[MAIN_MACHINE_ID].home}/festival` },
    );
    if (hosted.exitCode === 0) world = hosted.state;
  }
  return world;
}
