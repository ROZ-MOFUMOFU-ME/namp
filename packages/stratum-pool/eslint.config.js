import babelParser from '@babel/eslint-parser';
import prettier from 'eslint-config-prettier';

// typescript-eslint cannot run against TypeScript 7 (the native compiler
// no longer ships the JS compiler API), so TS syntax is parsed with
// @babel/eslint-parser (@babel/preset-typescript, no type info) and
// type-aware checking is tsc's job (npm run typecheck).
export default [
    {
        files: ['src/**/*.ts', 'test/**/*.ts'],
        languageOptions: {
            parser: babelParser,
            sourceType: 'module',
            parserOptions: {
                requireConfigFile: false,
                babelOptions: {
                    presets: ['@babel/preset-typescript'],
                },
            },
            globals: {
                global: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                BigInt: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
            },
        },
        rules: {
            // tsc --noEmit is the correctness gate; eslint surfaces a few style
            // rules as warnings (the faithful conversion keeps some var/this).
            // no-unused-vars misfires on TS-only syntax without type info —
            // left to tsc.
            'no-unused-vars': 'off',
            'no-console': 'off',
            'prefer-const': 'warn',
            'no-var': 'warn',
        },
    },
    {
        ignores: ['node_modules/**', 'dist/**', '*.log', 'eslint.config.js'],
    },
    prettier,
];
