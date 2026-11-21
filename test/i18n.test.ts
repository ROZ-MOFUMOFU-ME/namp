import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * The web UI's translations. A key missing from one language does not break
 * anything visibly: i18next falls back to English, so the gap ships and
 * stays (one label sat untranslated in 14 languages). These checks make the
 * table itself the contract: every language carries every key, with the
 * placeholders of the English string, and every key the UI asks for exists.
 */

const translations: Record<string, Record<string, string>> = JSON.parse(
    fs.readFileSync('web/src/i18n/translations.json', 'utf8')
);
const english = translations.en;
const placeholders = (text: string) =>
    [...text.matchAll(/\{\{\s*([^}\s,]+)[^}]*\}\}/g)].map((m) => m[1]).sort();

function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
}

test('every language carries exactly the English keys', () => {
    const reference = Object.keys(english).sort();
    for (const [language, table] of Object.entries(translations)) {
        const keys = new Set(Object.keys(table));
        assert.deepEqual(
            {
                missing: reference.filter((k) => !keys.has(k)),
                extra: [...keys].filter((k) => !(k in english)).sort()
            },
            { missing: [], extra: [] },
            `language ${language}`
        );
    }
});

test('no translation is empty, and each keeps the placeholders of the English text', () => {
    for (const [language, table] of Object.entries(translations)) {
        for (const [key, text] of Object.entries(table)) {
            assert.equal(typeof text, 'string', `${language}.${key}`);
            assert.notEqual(text.trim(), '', `${language}.${key} is empty`);
            assert.deepEqual(
                placeholders(text),
                placeholders(english[key] ?? ''),
                `${language}.${key} placeholders`
            );
        }
    }
});

test('every key the UI asks for exists', () => {
    const used = new Map<string, string>();
    for (const file of sourceFiles('web/src')) {
        const source = fs.readFileSync(file, 'utf8');
        for (const m of source.matchAll(/\bt\(\s*(['"])([A-Za-z0-9_.-]+)\1/g))
            if (!used.has(m[2])) used.set(m[2], file);
    }
    assert.ok(used.size > 100, "the scan must find the UI's t() calls");
    const unknown = [...used].filter(([key]) => !(key in english));
    assert.deepEqual(
        unknown,
        [],
        'keys used in web/src but absent from the table'
    );
});
