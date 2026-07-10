// Скачивает OpenAPI-спеку REST 3.0 с портала и сохраняет снапшот в репозиторий.
//
// Использование:
//   BITRIX_V3_SPEC_DOMAIN=portal.bitrix24.ru BITRIX_V3_SPEC_WEBHOOK=rest/1/token \
//     pnpm run bitrix-v3:spec
//
// Секреты в снапшот не попадают — сохраняются только paths/components.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_FILE = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'openapi',
    'bitrix-v3.openapi.json',
);

function resolveBaseUrl() {
    const domain = process.env.BITRIX_V3_SPEC_DOMAIN;
    const webhook = process.env.BITRIX_V3_SPEC_WEBHOOK;
    if (!domain || !webhook) {
        console.error(
            'Задайте BITRIX_V3_SPEC_DOMAIN и BITRIX_V3_SPEC_WEBHOOK (формат rest/{userId}/{token})',
        );
        process.exit(1);
    }
    const hookPath = webhook
        .trim()
        .replace(/^https?:\/\/[^/]+\//i, '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
        .replace(/^rest\//i, '');
    return `https://${domain}/rest/api/${hookPath}`;
}

const base = resolveBaseUrl();
const response = await fetch(`${base}/documentation`, { method: 'POST' });
if (!response.ok) {
    console.error(`HTTP ${response.status} при запросе documentation`);
    process.exit(1);
}
const spec = await response.json();
if (!spec.openapi || !spec.paths) {
    console.error('Ответ не похож на OpenAPI-спеку:', JSON.stringify(spec).slice(0, 300));
    process.exit(1);
}

await mkdir(dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, JSON.stringify(spec, null, 2) + '\n', 'utf8');

const paths = Object.keys(spec.paths);
console.log(`OpenAPI ${spec.openapi}, методов: ${paths.length}`);
console.log(
    'Неймспейсы:',
    [...new Set(paths.map(p => p.slice(1).split('.')[0]))].join(', '),
);
console.log(`Снапшот: ${OUT_FILE}`);
