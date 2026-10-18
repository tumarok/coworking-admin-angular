/**
 * The API contract shared by the client and the mock server. Types are derived from the schemas,
 * so the two sides cannot drift apart without a compile error.
 */
export * from './auth';
export * from './booking';
export * from './common';
export * from './dashboard';
export * from './location';
export * from './member';
export * from './room';
