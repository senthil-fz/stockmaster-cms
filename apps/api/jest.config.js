/**
 * Jest config for the @blockpress/api security gate tests.
 *
 * These are UNIT tests for the auth/scope guards — no live DB, no Nest DI
 * container. The guards are instantiated directly with hand-built fakes
 * (Reflector / PrismaService / JwtService / a fake req), so all we need from
 * Jest is ts-jest transform + a node environment.
 *
 * `@blockpress/shared` is mapped to its compiled dist so the guards' real
 * `publishStatusSchema` import (and the schema-drift pin) resolve without
 * pulling the workspace TS source into the test program.
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  // Load the reflect-metadata polyfill BEFORE any spec module is evaluated.
  // The guards (and PrismaService) apply @Injectable(), whose decorator body
  // calls Reflect.defineMetadata unguarded; in the real app main.ts imports the
  // polyfill first, but the jest context has nothing that pulls it in, so module
  // load would otherwise throw "Reflect.defineMetadata is not a function".
  setupFiles: ['reflect-metadata'],
  moduleNameMapper: {
    '^@blockpress/shared$': '<rootDir>/../../packages/shared/dist/index.js',
  },
  // Override the preset's transform entry IN PLACE (same key) so isolatedModules
  // reliably applies — a differently-keyed entry would shallow-merge alongside
  // the preset's and which one wins would be order-dependent. isolatedModules
  // skips cross-file type-checking so an unrelated type error elsewhere in the
  // source tree can't block the security gate from running.
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
      },
    ],
  },
  clearMocks: true,
};
