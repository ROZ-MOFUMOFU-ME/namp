import js from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import prettier from 'eslint-config-prettier';

// One flat config for the whole monorepo. typescript-eslint cannot run
// against TypeScript 7 (the native compiler ships no JS compiler API),
// so TS syntax is parsed with @babel/eslint-parser
// (@babel/preset-typescript, no type info) and type-aware checking is
// tsc's job (npm run typecheck). Rules that misfire without type info
// (no-unused-vars, no-undef) stay off.
//
// multi-hashing (plain-JS native addon) and the web SPA are not linted
// here; the lint script targets the TS surfaces explicitly.
const tsLanguage = {
    parser: babelParser,
    sourceType: 'module',
    parserOptions: {
        requireConfigFile: false,
        babelOptions: {
            presets: ['@babel/preset-typescript']
        }
    }
};

export default [
    {
        // Portal entry point only (the rest of the portal is covered by
        // tsc --noEmit + prettier).
        files: ['packages/portal/src/init.ts'],
        languageOptions: tsLanguage,
        rules: {
            ...js.configs.recommended.rules,
            'no-var': 'error',
            'prefer-const': 'error',
            'no-unused-vars': 'off',
            'no-undef': 'off',
            'no-redeclare': 'error'
        }
    },
    {
        // stratum-pool: tsc is the correctness gate; eslint surfaces a
        // few style rules as warnings (the faithful conversion keeps
        // some var/this).
        files: [
            'packages/stratum-pool/src/**/*.ts',
            'packages/stratum-pool/test/**/*.ts'
        ],
        languageOptions: tsLanguage,
        rules: {
            'no-unused-vars': 'off',
            'no-console': 'off',
            'prefer-const': 'warn',
            'no-var': 'warn'
        }
    },
    {
        // Web SPA (React/TSX). Babel 8 does not auto-enable JSX, so the
        // syntax plugin is explicit here.
        files: ['packages/portal/web/src/**/*.{ts,tsx}'],
        languageOptions: {
            ...tsLanguage,
            parserOptions: {
                requireConfigFile: false,
                babelOptions: {
                    presets: ['@babel/preset-typescript'],
                    plugins: ['@babel/plugin-syntax-jsx']
                }
            },
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                localStorage: 'readonly',
                fetch: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                EventSource: 'readonly',
                URLSearchParams: 'readonly'
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': 'off',
            'no-undef': 'off',
            'no-redeclare': 'error'
        }
    },
    prettier
];
