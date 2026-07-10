// Генерирует TypeScript-типы из снапшота OpenAPI-спеки (openapi/bitrix-v3.openapi.json)
// в src/generated/openapi.ts.
//
//   pnpm run bitrix-v3:codegen                    — неймспейсы по умолчанию
//   BITRIX_V3_CODEGEN_PREFIXES=humanresources,tasks pnpm run bitrix-v3:codegen
//
// ВАЖНО: спека Битрикса пока сырая (см. BITRIX_V3_DOMAIN_MODULE_GUIDE.md),
// поэтому сгенерированные типы — справочные. Источник правды для рантайма —
// рукописные схемы доменов (BxV3MethodMap), сверенные с живыми ответами.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_FILE = join(ROOT, 'openapi', 'bitrix-v3.openapi.json');
const OUT_FILE = join(ROOT, 'src', 'generated', 'openapi.ts');

const PREFIXES = (process.env.BITRIX_V3_CODEGEN_PREFIXES ?? 'humanresources')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

const spec = JSON.parse(await readFile(SPEC_FILE, 'utf8'));

// --- фильтрация paths по неймспейсам ---
const paths = {};
for (const [path, def] of Object.entries(spec.paths)) {
    const ns = path.slice(1).split('.')[0];
    if (PREFIXES.includes(ns)) {
        paths[path] = def;
    }
}
if (Object.keys(paths).length === 0) {
    console.error(`Не найдено методов для неймспейсов: ${PREFIXES.join(', ')}`);
    process.exit(1);
}

// --- сбор используемых $ref, чтобы не тащить все components ---
const usedRefs = new Set();
function collectRefs(node) {
    if (Array.isArray(node)) {
        node.forEach(collectRefs);
        return;
    }
    if (typeof node !== 'object' || node === null) {
        return;
    }
    for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') {
            const name = value.replace('#/components/schemas/', '');
            if (!usedRefs.has(name)) {
                usedRefs.add(name);
                const schema = spec.components?.schemas?.[name];
                if (schema) {
                    collectRefs(schema);
                }
            }
        } else {
            collectRefs(value);
        }
    }
}
collectRefs(paths);

const schemas = {};
for (const name of usedRefs) {
    if (spec.components?.schemas?.[name]) {
        schemas[name] = spec.components.schemas[name];
    }
}

const filtered = {
    openapi: spec.openapi,
    info: spec.info,
    paths,
    components: { schemas },
};

// --- генерация ---
const { default: openapiTS, astToString } = await import('openapi-typescript');
const ast = await openapiTS(filtered);
const generated = astToString(ast);

const banner = [
    '/* eslint-disable */',
    '// Сгенерировано автоматически из openapi/bitrix-v3.openapi.json.',
    '// НЕ редактировать руками — пересоздать: pnpm run bitrix-v3:codegen',
    `// Неймспейсы: ${PREFIXES.join(', ')}; методов: ${Object.keys(paths).length}`,
    '',
    '',
].join('\n');

await mkdir(dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, banner + generated, 'utf8');
console.log(
    `Сгенерировано: ${OUT_FILE} (${Object.keys(paths).length} методов, ${usedRefs.size} схем)`,
);
