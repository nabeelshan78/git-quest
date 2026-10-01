/**
 * Engine core: git's data model (objects, trees, refs, reflog, index
 * storage), the simulated filesystem and repository discovery.
 * Written in the foundation step; Engine A owns it afterwards and may add
 * helpers (never change existing signatures without the orchestrator).
 */
export * from './sha1';
export * from './objects';
export * from './paths';
export * from './fs';
export * from './repo';
export * from './world';
