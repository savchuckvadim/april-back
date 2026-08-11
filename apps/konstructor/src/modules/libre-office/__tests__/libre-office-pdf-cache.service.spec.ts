import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { StorageService } from '@lib/core/storage';
import { LibreOfficeConfig } from '../config/libre-office.config';
import { LibreOfficePdfCacheService } from '../services/libre-office-pdf-cache.service';
import { libreOfficeConfig } from './libre-office.fixtures';

describe('LibreOfficePdfCacheService', () => {
    let dir: string;
    let cacheDir: string;
    let docxPath: string;
    let pdfPath: string;

    function build(
        overrides: Partial<LibreOfficeConfig> = {},
    ): LibreOfficePdfCacheService {
        const storage = {
            getFilePath: (_type: string, _sub: string, fileName: string) =>
                join(cacheDir, fileName),
        } as unknown as StorageService;
        return new LibreOfficePdfCacheService(
            libreOfficeConfig(overrides),
            storage,
        );
    }

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'libre-cache-'));
        cacheDir = join(dir, 'cache');
        docxPath = join(dir, 'offer.docx');
        pdfPath = join(dir, 'offer.pdf');
        await writeFile(docxPath, 'docx-содержимое');
        await writeFile(pdfPath, '%PDF-содержимое');
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    describe('ключ', () => {
        it('одинаковый для одинакового содержимого DOCX', async () => {
            const cache = build();
            const copyPath = join(dir, 'другое-имя.docx');
            await writeFile(copyPath, 'docx-содержимое');

            expect(await cache.keyFor(docxPath)).toBe(
                await cache.keyFor(copyPath),
            );
        });

        it('меняется при изменении содержимого DOCX', async () => {
            const cache = build();
            const before = await cache.keyFor(docxPath);
            await writeFile(docxPath, 'docx-содержимое, но другое');

            expect(await cache.keyFor(docxPath)).not.toBe(before);
        });

        it('меняется при смене настроек PDF — иначе отдали бы PDF в старом качестве', async () => {
            const withDefaults = await build().keyFor(docxPath);
            const withOptions = await build({
                pdf: { reduceImageResolution: true, maxImageResolution: 150 },
            }).keyFor(docxPath);

            expect(withOptions).not.toBe(withDefaults);
        });

        it('null, когда кэш выключен', async () => {
            await expect(
                build({ cacheEnabled: false }).keyFor(docxPath),
            ).resolves.toBeNull();
        });

        it('null, если файла нет — работаем без кэша, а не падаем', async () => {
            await expect(
                build().keyFor(join(dir, 'нет-файла.docx')),
            ).resolves.toBeNull();
        });
    });

    describe('put/get', () => {
        it('возвращает сохранённый PDF по нужному пути', async () => {
            const cache = build();
            const key = (await cache.keyFor(docxPath)) as string;
            await cache.put(key, pdfPath);

            const targetPath = join(dir, 'копия.pdf');
            await expect(cache.get(key, targetPath)).resolves.toBe(true);
            expect(await readFile(targetPath, 'utf8')).toBe('%PDF-содержимое');
        });

        it('промах, если такого ключа не было', async () => {
            await expect(
                build().get('несуществующий-ключ', join(dir, 'x.pdf')),
            ).resolves.toBe(false);
        });

        it('просроченную запись считает промахом и удаляет', async () => {
            const cache = build({ cacheTtlHours: 1 });
            const key = (await cache.keyFor(docxPath)) as string;
            await cache.put(key, pdfPath);
            const cachedFile = join(cacheDir, `${key}.pdf`);
            const old = new Date(Date.now() - 2 * 3600 * 1000);
            await utimes(cachedFile, old, old);

            await expect(cache.get(key, join(dir, 'копия.pdf'))).resolves.toBe(
                false,
            );
            expect(existsSync(cachedFile)).toBe(false);
        });

        it('не роняет конвертацию, если сохранить не удалось', async () => {
            const cache = build();

            await expect(
                cache.put('ключ', join(dir, 'нет-такого.pdf')),
            ).resolves.toBeUndefined();
        });

        it('свежую запись не трогает', async () => {
            const cache = build();
            const key = (await cache.keyFor(docxPath)) as string;
            await cache.put(key, pdfPath);

            const info = await stat(join(cacheDir, `${key}.pdf`));
            expect(info.size).toBeGreaterThan(0);
            await expect(cache.get(key, join(dir, 'копия.pdf'))).resolves.toBe(
                true,
            );
        });
    });
});
