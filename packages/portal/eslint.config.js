import js from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import prettier from 'eslint-config-prettier';

// typescript-eslint cannot run against TypeScript 7 (the native compiler
// no longer ships the JS compiler API), so TS syntax is parsed with
// @babel/eslint-parser (@babel/preset-typescript, no type info) and
// type-aware checking is tsc's job (npm run typecheck).
export default [
    {
        // Entry point only (the rest of src/ is covered by `tsc --noEmit` + prettier).
        files: ['src/init.ts'],
        languageOptions: {
            parser: babelParser,
            sourceType: 'module',
            parserOptions: {
                requireConfigFile: false,
                babelOptions: {
                    presets: ['@babel/preset-typescript']
                }
            },
            globals: {
                // Node.js globals
                console: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly',
                exports: 'readonly',
                global: 'readonly',
                setImmediate: 'readonly',
                clearImmediate: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly'
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-var': 'error',
            'prefer-const': 'error',
            // no-unused-vars / no-undef misfire on TS syntax without type
            // info — both are tsc's job.
            'no-unused-vars': 'off',
            'no-undef': 'off',
            'no-redeclare': 'error'
        }
    },
    {
        ignores: [
            'node_modules/**',
            '*.min.js',
            'dist/**',
            'build/**',
            'newrelic_agent.log',
            'pool_configs/**',
            'scripts/**',
            'web/**',
            '*.log',
            'logs/**',
            'config.json',
            'config_example.json'
        ]
    },
    prettier
];
