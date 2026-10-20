import js from '@eslint/js';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

/** Everything an app slice may use besides its own folder. */
const SHARED_LAYERS = ['shared', 'contract'];

/**
 * Layer map, first match wins, so the contract (a part of `shared` that must stay free of Angular)
 * is listed before `shared`.
 */
const elements = [
  { type: 'contract', pattern: 'src/app/shared/api/contract' },
  { type: 'shared', pattern: 'src/app/shared' },
  { type: 'core', pattern: 'src/app/core' },
  { type: 'feature', pattern: 'src/app/features/*', capture: ['feature'] },
  { type: 'testing', pattern: 'src/testing' },
  { type: 'server', pattern: 'server' },
  { type: 'e2e', pattern: 'e2e' },
];

/** Allowed imports per layer. Everything not listed here is rejected (`default: 'disallow'`). */
const policies = [
  {
    // The files directly in `src/app` (root component, config, routes) assemble the application.
    from: { file: { categories: 'app-root' } },
    allow: [
      { to: { file: { categories: 'app-root' } } },
      { to: { element: { types: { anyOf: ['core', 'feature', ...SHARED_LAYERS] } } } },
    ],
  },
  {
    from: { element: { type: 'feature' } },
    allow: [
      { to: { element: { types: { anyOf: ['core', ...SHARED_LAYERS] } } } },
      // Slices never see each other: only the folder of the importing feature is reachable.
      {
        to: { element: { type: 'feature', captured: { feature: '{{ from.captured.feature }}' } } },
      },
    ],
  },
  {
    from: { element: { type: 'core' } },
    allow: { to: { element: { types: { anyOf: ['core', ...SHARED_LAYERS] } } } },
  },
  {
    from: { element: { type: 'shared' } },
    allow: { to: { element: { types: { anyOf: SHARED_LAYERS } } } },
  },
  {
    // The contract is shared with the mock server, which runs in Node: no Angular, no other layers.
    from: { element: { type: 'contract' } },
    allow: { to: { element: { type: 'contract' } } },
  },
  {
    from: { element: { type: 'server' } },
    allow: { to: { element: { types: { anyOf: ['server', 'contract'] } } } },
  },
  {
    from: { element: { type: 'testing' } },
    allow: {
      to: { element: { types: { anyOf: ['testing', 'server', 'core', ...SHARED_LAYERS] } } },
    },
  },
  {
    // The end-to-end suite drives the built app from outside: it imports nothing of it, only itself
    // and the test libraries.
    from: { element: { type: 'e2e' } },
    allow: { to: { element: { type: 'e2e' } } },
  },
  {
    // Test helpers are for specs only: no other policy lets a layer reach `src/testing`.
    from: { file: { categories: 'spec' } },
    allow: { to: { element: { type: 'testing' } } },
  },
];

export default defineConfig(
  globalIgnores(['dist/', 'coverage/', '.angular/', 'playwright-report/', 'test-results/']),
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/prefer-signals': 'error',
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },
  {
    files: ['src/**/*.ts', 'server/**/*.ts', 'e2e/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/elements': elements,
      'boundaries/files': [
        { category: 'spec', pattern: '**/*.spec.ts' },
        { category: 'app-root', pattern: ['src/main.ts', 'src/app/*.ts'] },
      ],
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', policies }],
      'boundaries/no-unknown-files': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../*'],
              message:
                'Leaving the parent folder: import through @core/*, @shared/* or @features/*.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
