import { describe, expect, it } from 'vitest';
import { runSetup, substituteTemplates, substituteLevel } from '../../../src/levels/setup';
import type { LevelDefinition } from '../../../src/shared/level';
import type { PlayerProfile } from '../../../src/shared/progress';

const player: PlayerProfile = {
  id: 'test-id',
  name: 'Test User',
  handle: 'testuser',
  email: 'test@example.com',
  classCode: '',
  createdAt: '2026-01-01',
};

function minimalLevel(steps: any[]): LevelDefinition {
  return {
    id: '0.1',
    chapter: 0,
    number: 1,
    title: 'Test Level',
    concept: 'testing',
    story: [{ speaker: 'Ada', text: 'Hello!' }],
    setup: { steps },
    goal: { items: [{ text: 'Do something', checks: [{ type: 'storyRead' }] }] },
    par: 1,
    allowedCommands: null,
    hints: ['Hint 1', 'Hint 2', 'Hint 3'],
    predict: null,
    recap: 'You learned something!',
    solution: [{ story: 'read' }],
  } as unknown as LevelDefinition;
}

describe('substituteTemplates', () => {
  it('replaces player name, email and handle', () => {
    const text = 'Hello {{player.name}}, your email is {{player.email}} and handle is {{player.handle}}';
    const result = substituteTemplates(text, player);
    expect(result).toBe('Hello Test User, your email is test@example.com and handle is testuser');
  });
});

describe('runSetup', () => {
  it('creates a world with a default machine', () => {
    const level = minimalLevel([]);
    const { world, errors } = runSetup(level, player);
    expect(errors).toHaveLength(0);
    expect(world.machines['laptop']).toBeDefined();
    expect(world.machines['laptop'].globalConfig['user.name']).toBe('Test User');
    expect(world.machines['laptop'].globalConfig['user.email']).toBe('test@example.com');
  });

  it('executes run steps', () => {
    const level = minimalLevel([
      { run: 'git init' },
    ]);
    const { world, errors } = runSetup(level, player);
    expect(errors).toHaveLength(0);
    // After git init, the machine should have a repo
    expect(Object.keys(world.machines['laptop'].repos)).toHaveLength(1);
  });

  it('executes files steps', () => {
    const level = minimalLevel([
      { files: { 'hello.txt': 'world' } },
    ]);
    const { world, errors } = runSetup(level, player);
    expect(errors).toHaveLength(0);
    const machine = world.machines['laptop'];
    // The file should exist in the filesystem
    const absPath = `${machine.home}/hello.txt`;
    expect(machine.fs.files[absPath]).toBe('world');
  });

  it('executes commit steps', () => {
    const level = minimalLevel([
      { run: 'git init' },
      { commit: { message: 'Initial commit', files: { 'file.txt': 'content' } } },
    ]);
    const { world, errors } = runSetup(level, player);
    expect(errors).toHaveLength(0);
    const machine = world.machines['laptop'];
    const root = Object.keys(machine.repos)[0];
    expect(root).toBeDefined();
    const repo = machine.repos[root];
    expect(repo.refs['refs/heads/main']).toBeDefined();
  });

  it('advances the clock', () => {
    const level = minimalLevel([
      { advanceClock: 3600 },
    ]);
    const { world } = runSetup(level, player);
    // Clock should have advanced by 3600 seconds from the default
    expect(world.clock).toBeGreaterThan(1767268800);
  });

  it('adds machines', () => {
    const level = minimalLevel([
      { machineAdd: { id: 'server', label: 'Server', user: 'admin', host: 'server' } },
    ]);
    const { world, errors } = runSetup(level, player);
    expect(errors).toHaveLength(0);
    expect(world.machines['server']).toBeDefined();
    expect(world.machines['server'].user).toBe('admin');
  });

  it('switches machines', () => {
    const level = minimalLevel([
      { machineAdd: { id: 'server', label: 'Server' } },
      { switchMachine: 'server' },
    ]);
    const { world, errors } = runSetup(level, player);
    expect(errors).toHaveLength(0);
    expect(world.activeMachine).toBe('server');
  });
});
