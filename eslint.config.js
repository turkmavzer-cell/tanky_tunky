import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', '.bench-dist', 'android', 'node_modules', 'coverage', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Determinism guard for the simulation core (DECISIONS D-004).
    files: ['src/sim/**/*.ts', 'src/world/**/*.ts', 'src/ai/**/*.ts', 'src/systems/**/*.ts'],
    ignores: ['src/world/iso.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['random', 'sin', 'cos', 'tan', 'atan', 'atan2', 'asin', 'acos', 'exp', 'log', 'pow', 'hypot', 'cbrt'].map((p) => ({
          object: 'Math',
          property: p,
          message: 'Non-deterministic across JS engines; use src/sim/dmath.ts or Rng.',
        })),
        { object: 'Date', property: 'now', message: 'Simulation must not read wall-clock time.' },
        { object: 'performance', property: 'now', message: 'Simulation must not read wall-clock time.' },
      ],
      'no-restricted-globals': ['error', { name: 'window', message: 'src/sim must stay DOM-free (runs in Node).' }, { name: 'document', message: 'src/sim must stay DOM-free (runs in Node).' }],
    },
  },
);
