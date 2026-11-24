import { existsSync, readFileSync } from 'fs';
import { Logger } from '@nestjs/common';
import sharp from 'sharp';
import { PROVIDER_IMAGE_MAX_BYTES } from '../../lib/provider-image-file.util';
import { PROVIDER_IMAGE_MESSAGES } from '../../provider-image.messages';
import { ProviderImageService } from '../../provider-image.service';
import { MemoryProviderImageRepository } from '../../__tests__/memory-provider-image.repository';
import {
    createTempStorage,
    fakeHtml,
    makeInterlacedPng,
    makePng,
    TempStorage,
} from '../../__tests__/support/image-fixtures';
import { LegacyRqFile, LegacyRqInfo } from '../legacy-rq-file.entity';
import { PROVIDER_IMAGE_LEGACY_IMPORT_MESSAGES as MESSAGES } from '../provider-image-legacy-import.messages';
import { ProviderImageLegacyImportService } from '../provider-image-legacy-import.service';
import {
    ProviderImageLegacyImportReport,
    ProviderImageLegacyImportRow,
    ProviderImageLegacyUpload,
} from '../provider-image-legacy-import.types';
import { MemoryLegacyRqFileRepository } from './memory-legacy-rq-file.repository';

const RQ = 15;
const OTHER_RQ = 16;
const DOMAIN = 'garant.test';

const legacyPath = (rqId: number, type: string, id: number): string =>
    `clients/${DOMAIN}/rq/${rqId}/${type}/${rqId}_${type}_x_${id}.png`;

const record = (
    id: number,
    parentType: string,
    over: Partial<LegacyRqFile> = {},
): LegacyRqFile => ({
    id,
    rqId: RQ,
    parentType,
    code: parentType,
    path: legacyPath(over.rqId ?? RQ, parentType, id),
    ...over,
});

/** Записи реквизитов 15: печать, подпись руководителя, подпись бухгалтера, логотип, QR. */
const rqRecords = (): LegacyRqFile[] => [
    record(101, 'stamp'),
    record(102, 'signature', { code: 'signature' }),
    record(103, 'signature', { code: 'signature_accountant' }),
    record(104, 'logo'),
    record(105, 'qr'),
];

const INFOS: LegacyRqInfo[] = [
    { rqId: RQ, rqName: 'ООО Ромашка', portalDomain: DOMAIN },
    { rqId: OTHER_RQ, rqName: null, portalDomain: null },
];

describe('перенос картинок поставщика из легаси: сервис', () => {
    let temp: TempStorage;
    let images: MemoryProviderImageRepository;
    let legacy: MemoryLegacyRqFileRepository;
    let service: ProviderImageLegacyImportService;
    let png: Buffer;

    beforeAll(async () => {
        png = await makePng(60, 30);
    });

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        temp = createTempStorage();
        images = new MemoryProviderImageRepository([RQ, OTHER_RQ]);
        legacy = new MemoryLegacyRqFileRepository(rqRecords(), [...INFOS]);
        service = new ProviderImageLegacyImportService(
            legacy,
            images,
            new ProviderImageService(images, temp.storage),
        );
    });

    afterEach(() => {
        temp.cleanup();
        jest.restoreAllMocks();
    });

    const uploadOf = (
        files: LegacyRqFile[],
        buffer: Buffer | undefined = png,
    ): ProviderImageLegacyUpload[] =>
        files.map(file => ({ name: file.path, buffer }));

    const rowOf = (
        report: ProviderImageLegacyImportReport,
        legacyFileId: number,
    ): ProviderImageLegacyImportRow => {
        const row = report.rows.find(
            item => item.legacyFileId === legacyFileId,
        );
        if (!row) throw new Error(`нет строки для записи ${legacyFileId}`);
        return row;
    };

    const statuses = (report: ProviderImageLegacyImportReport) =>
        report.rows.map(row => [row.legacyFileId, row.status]);

    describe('проверка (dryRun)', () => {
        it('ничего не пишет и обещает перенос выбранных записей', async () => {
            const report = await service.run(uploadOf(rqRecords()), true);

            expect(report.dryRun).toBe(true);
            expect(statuses(report)).toEqual([
                [101, 'would-import'],
                [102, 'would-import'],
                [103, 'would-import'],
                [104, 'would-import'],
                [105, 'skipped'],
            ]);
            expect(report.totals).toEqual({
                imported: 0,
                wouldImport: 4,
                exists: 0,
                already: 0,
                noFile: 0,
                skipped: 1,
                error: 0,
            });
            expect(images.rows).toHaveLength(0);
            expect(existsSync(temp.fullPath(''))).toBe(false);
        });

        it('строка несёт реквизиты, домен портала, роль, путь легаси и пояснение', async () => {
            const report = await service.run(uploadOf(rqRecords()), true);

            expect(rowOf(report, 101)).toEqual({
                portalDomain: DOMAIN,
                rqId: RQ,
                rqName: 'ООО Ромашка',
                role: 'stamp',
                legacyFileId: 101,
                legacyPath: legacyPath(RQ, 'stamp', 101),
                status: 'would-import',
                message: MESSAGES.wouldImport('stamp'),
            });
            const qr = rowOf(report, 105);
            expect(qr.role).toBeNull();
            expect(qr.message).toContain('QR');
        });
    });

    describe('перенос', () => {
        it('пишет картинки через сервис: роль, legacyFileId, имя файла, файл на диске', async () => {
            const report = await service.run(uploadOf(rqRecords()), false);

            expect(report.dryRun).toBe(false);
            expect(statuses(report)).toEqual([
                [101, 'imported'],
                [102, 'imported'],
                [103, 'imported'],
                [104, 'imported'],
                [105, 'skipped'],
            ]);
            expect(report.totals.imported).toBe(4);
            expect(images.rows).toHaveLength(4);

            const byRole = new Map(images.rows.map(row => [row.role, row]));
            expect(byRole.get('stamp')).toMatchObject({
                rqId: RQ,
                legacyFileId: 101,
                format: 'png',
                width: 60,
                height: 30,
                originalName: '15_stamp_x_101.png',
            });
            expect(byRole.get('signature_director')?.legacyFileId).toBe(102);
            expect(byRole.get('signature_accountant')?.legacyFileId).toBe(103);
            expect(byRole.get('logo')?.legacyFileId).toBe(104);
            for (const image of images.rows) {
                expect(existsSync(temp.fullPath(image.path))).toBe(true);
            }
        });

        it('картинка перекодируется, как при загрузке из админки', async () => {
            const interlaced = await makeInterlacedPng(50, 20);
            await service.run(
                uploadOf([record(101, 'stamp')], interlaced),
                false,
            );

            const [image] = images.rows;
            const stored = readFileSync(temp.fullPath(image.path));
            expect((await sharp(stored).metadata()).isProgressive).toBe(false);
            expect(image.size).toBe(stored.length);
        });

        it('повторный запуск: перенесённое уже на месте, копий нет', async () => {
            await service.run(uploadOf(rqRecords()), false);
            const before = images.rows.map(row => ({ ...row }));

            const second = await service.run(uploadOf(rqRecords()), false);

            expect(statuses(second)).toEqual([
                [101, 'already'],
                [102, 'already'],
                [103, 'already'],
                [104, 'already'],
                [105, 'skipped'],
            ]);
            expect(second.totals.already).toBe(4);
            expect(images.rows).toEqual(before);
        });

        it('проверка после переноса тоже показывает already', async () => {
            await service.run(uploadOf(rqRecords()), false);
            const check = await service.run(uploadOf(rqRecords()), true);
            expect(check.totals.already).toBe(4);
            expect(check.totals.wouldImport).toBe(0);
        });
    });

    describe('уже существующие картинки', () => {
        it('картинка роли, загруженная в админке, не перезаписывается: exists', async () => {
            const adminService = new ProviderImageService(images, temp.storage);
            const own = await adminService.put(RQ, 'stamp', { buffer: png });

            const report = await service.run(uploadOf(rqRecords()), false);

            const row = rowOf(report, 101);
            expect(row.status).toBe('exists');
            expect(row.message).toBe(MESSAGES.exists(null));
            expect(report.totals.exists).toBe(1);
            expect(report.totals.imported).toBe(3);
            const stamp = images.rows.find(image => image.role === 'stamp');
            expect(stamp?.id).toBe(own.id);
            expect(stamp?.legacyFileId).toBeNull();
        });

        it('картинка роли, перенесённая из другой записи files, не перезаписывается: exists', async () => {
            const adminService = new ProviderImageService(images, temp.storage);
            await adminService.put(
                RQ,
                'logo',
                { buffer: png },
                { legacyFileId: 999 },
            );

            const report = await service.run(uploadOf(rqRecords()), false);

            const row = rowOf(report, 104);
            expect(row.status).toBe('exists');
            expect(row.message).toBe(MESSAGES.exists(999));
            expect(
                images.rows.find(image => image.role === 'logo')?.legacyFileId,
            ).toBe(999);
        });

        it('в проверке exists тоже обнаруживается', async () => {
            const adminService = new ProviderImageService(images, temp.storage);
            await adminService.put(RQ, 'signature_director', { buffer: png });

            const report = await service.run(uploadOf(rqRecords()), true);

            expect(rowOf(report, 102).status).toBe('exists');
            expect(report.totals.wouldImport).toBe(3);
        });
    });

    describe('файл не загружен', () => {
        it('запись без загруженного файла: no-file, остальные переносятся', async () => {
            const report = await service.run(
                uploadOf(rqRecords().filter(file => file.id !== 103)),
                false,
            );

            const row = rowOf(report, 103);
            expect(row.status).toBe('no-file');
            expect(row.message).toBe(MESSAGES.noFile(row.legacyPath));
            expect(report.totals.noFile).toBe(1);
            expect(report.totals.imported).toBe(3);
            expect(
                images.rows.some(
                    image => image.role === 'signature_accountant',
                ),
            ).toBe(false);
        });

        it('в отчёт попадают все записи реквизитов, даже если загружен один файл', async () => {
            const report = await service.run(
                uploadOf([record(101, 'stamp')]),
                true,
            );

            expect(statuses(report)).toEqual([
                [101, 'would-import'],
                [102, 'no-file'],
                [103, 'no-file'],
                [104, 'no-file'],
                [105, 'skipped'],
            ]);
        });

        it('реквизиты без загруженных файлов в отчёт не попадают', async () => {
            legacy.files.push(record(201, 'stamp', { rqId: OTHER_RQ }));

            const report = await service.run(
                uploadOf([record(101, 'stamp')]),
                true,
            );

            expect(report.rows.some(row => row.rqId === OTHER_RQ)).toBe(false);
        });
    });

    describe('ошибки записи', () => {
        it('чужой формат: error с текстом сервиса, остальные записи идут дальше', async () => {
            const files = rqRecords();
            const report = await service.run(
                [
                    { name: files[0].path, buffer: fakeHtml() },
                    ...uploadOf(files.slice(1)),
                ],
                false,
            );

            const row = rowOf(report, 101);
            expect(row.status).toBe('error');
            expect(row.message).toBe(PROVIDER_IMAGE_MESSAGES.unsupportedFormat);
            expect(report.totals.error).toBe(1);
            expect(report.totals.imported).toBe(3);
            expect(images.rows.some(image => image.role === 'stamp')).toBe(
                false,
            );
        });

        it('файл больше лимита картинки поставщика: error с текстом про размер', async () => {
            const huge = Buffer.concat([
                png,
                Buffer.alloc(PROVIDER_IMAGE_MAX_BYTES, 0),
            ]);
            const report = await service.run(
                uploadOf([record(104, 'logo')], huge),
                false,
            );

            const row = rowOf(report, 104);
            expect(row.status).toBe('error');
            expect(row.message).toBe(PROVIDER_IMAGE_MESSAGES.tooLarge);
        });

        it('сбой записи в базу остаётся в строке отчёта, запрос выполняется до конца', async () => {
            images.failNextUpsert = new Error('Deadlock found   when trying');

            const report = await service.run(
                uploadOf([record(101, 'stamp'), record(104, 'logo')]),
                false,
            );

            expect(rowOf(report, 101)).toMatchObject({
                status: 'error',
                message: 'Deadlock found when trying',
            });
            expect(rowOf(report, 104).status).toBe('imported');
        });

        it('ошибка не мешает повторному запуску: исправленный файл переносится', async () => {
            await service.run(
                [{ name: legacyPath(RQ, 'stamp', 101), buffer: fakeHtml() }],
                false,
            );
            const second = await service.run(
                uploadOf([record(101, 'stamp')]),
                false,
            );
            expect(rowOf(second, 101).status).toBe('imported');
        });

        it('запись files указывает на несуществующие реквизиты: error и в проверке, и при переносе', async () => {
            legacy.infos.splice(0, legacy.infos.length);
            const files = [record(101, 'stamp')];

            const check = await service.run(uploadOf(files), true);
            const run = await service.run(uploadOf(files), false);

            for (const report of [check, run]) {
                const row = rowOf(report, 101);
                expect(row.status).toBe('error');
                expect(row.message).toBe(MESSAGES.rqMissing(RQ));
                expect(row.portalDomain).toBeNull();
                expect(row.rqName).toBeNull();
            }
            expect(images.rows).toHaveLength(0);
        });
    });

    describe('сопоставление путей', () => {
        it('имя с папкой выше clients и обратными слэшами находит запись', async () => {
            const report = await service.run(
                [
                    {
                        name: `Downloads\\backup\\${legacyPath(RQ, 'stamp', 101).replace(/\//g, '\\')}`,
                        buffer: png,
                    },
                    {
                        name: `./backup//${legacyPath(RQ, 'logo', 104)}`,
                        buffer: png,
                    },
                ],
                false,
            );

            expect(rowOf(report, 101).status).toBe('imported');
            expect(rowOf(report, 104).status).toBe('imported');
            // нет других строк: ни «лишних» файлов, ни пропавших
            expect(report.rows.filter(row => row.legacyFileId === 0)).toEqual(
                [],
            );
        });

        it('имя без пути, которого нет среди записей, остаётся файлом без записи', async () => {
            const report = await service.run(
                [{ name: '15_stamp_x_999.png', buffer: png }],
                true,
            );

            expect(report.rows).toHaveLength(1);
            expect(report.rows[0]).toMatchObject({
                status: 'skipped',
                role: null,
                legacyFileId: 0,
                rqId: 0,
                legacyPath: '15_stamp_x_999.png',
            });
        });

        it('точное совпадение: чужой домен или id в пути записи не находят', async () => {
            const report = await service.run(
                [
                    {
                        name: legacyPath(RQ, 'stamp', 101).replace(
                            DOMAIN,
                            'other.test',
                        ),
                        buffer: png,
                    },
                ],
                true,
            );
            expect(report.rows).toHaveLength(1);
            expect(report.rows[0].status).toBe('skipped');
        });

        it('один и тот же путь в запросе дважды — одна строка', async () => {
            const path = legacyPath(RQ, 'stamp', 101);
            const report = await service.run(
                [
                    { name: path, buffer: png },
                    { name: `x/${path}`, buffer: png },
                ],
                true,
            );
            expect(
                report.rows.filter(row => row.legacyFileId === 101),
            ).toHaveLength(1);
            expect(report.rows.every(row => row.legacyFileId !== 0)).toBe(true);
        });
    });

    describe('имя без пути (старый клиент прислал только название файла)', () => {
        const BASE_NAME = '15_stamp_x_101.png';

        it('имя, которое однозначно среди записей files, находит запись', async () => {
            const report = await service.run(
                [{ name: BASE_NAME, buffer: png }],
                false,
            );

            const row = rowOf(report, 101);
            expect(row).toMatchObject({
                status: 'imported',
                role: 'stamp',
                legacyPath: legacyPath(RQ, 'stamp', 101),
            });
            expect(
                images.rows.find(image => image.role === 'stamp')?.legacyFileId,
            ).toBe(101);
            // отдельной строки «нет записи» у файла нет
            expect(report.rows.some(item => item.legacyFileId === 0)).toBe(
                false,
            );
        });

        it('часть пути без корня clients тоже ищется по хвосту', async () => {
            const report = await service.run(
                [{ name: `rq/${RQ}/stamp/${BASE_NAME}`, buffer: png }],
                true,
            );
            expect(rowOf(report, 101).status).toBe('would-import');
        });

        it('имя подходит к нескольким записям: skipped с пояснением, запись не выполняется', async () => {
            legacy.files.push(
                record(201, 'stamp', {
                    rqId: OTHER_RQ,
                    path: `clients/other.test/rq/16/stamp/${BASE_NAME}`,
                }),
            );

            const report = await service.run(
                [{ name: BASE_NAME, buffer: png }],
                false,
            );

            expect(report.rows).toHaveLength(1);
            expect(report.rows[0]).toMatchObject({
                status: 'skipped',
                role: null,
                legacyFileId: 0,
                rqId: 0,
                legacyPath: BASE_NAME,
                message: MESSAGES.ambiguous([101, 201]),
            });
            expect(report.rows[0].message).toContain('101');
            expect(report.rows[0].message).toContain('201');
            expect(images.rows).toHaveLength(0);
        });

        it('тот же файл с полным путём находит свою запись и при совпадающих именах', async () => {
            legacy.files.push(
                record(201, 'stamp', {
                    rqId: OTHER_RQ,
                    path: `clients/other.test/rq/16/stamp/${BASE_NAME}`,
                }),
            );

            const report = await service.run(
                [{ name: legacyPath(RQ, 'stamp', 101), buffer: png }],
                true,
            );

            expect(rowOf(report, 101).status).toBe('would-import');
            expect(report.rows.some(row => row.legacyFileId === 201)).toBe(
                false,
            );
        });

        it('имени нет среди записей files: skipped «нет записи»', async () => {
            const report = await service.run(
                [{ name: 'nothing.png', buffer: png }],
                true,
            );
            expect(report.rows).toHaveLength(1);
            expect(report.rows[0]).toMatchObject({
                status: 'skipped',
                legacyFileId: 0,
                message: MESSAGES.noRecord,
            });
        });

        it('путь с корнем clients по базовому имени не ищется', async () => {
            const report = await service.run(
                [
                    {
                        name: `clients/other.test/rq/99/stamp/${BASE_NAME}`,
                        buffer: png,
                    },
                ],
                true,
            );
            expect(report.rows).toHaveLength(1);
            expect(report.rows[0]).toMatchObject({
                status: 'skipped',
                legacyFileId: 0,
                message: MESSAGES.noRecord,
            });
        });

        it('имя и полный путь одного файла дают одну запись и один перенос', async () => {
            const report = await service.run(
                [
                    { name: BASE_NAME, buffer: png },
                    { name: legacyPath(RQ, 'stamp', 101), buffer: png },
                ],
                false,
            );
            expect(
                report.rows.filter(row => row.legacyFileId === 101),
            ).toHaveLength(1);
            expect(rowOf(report, 101).status).toBe('imported');
            expect(
                images.rows.filter(row => row.role === 'stamp'),
            ).toHaveLength(1);
        });
    });

    describe('файлы без записи в files', () => {
        it('попадают в отчёт как skipped с rqId 0 и legacyFileId 0', async () => {
            const report = await service.run(
                [
                    ...uploadOf([record(101, 'stamp')]),
                    {
                        name: 'clients/other.test/rq/99/stamp/zzz.png',
                        buffer: png,
                    },
                ],
                true,
            );

            const orphan = report.rows.find(row => row.legacyFileId === 0);
            expect(orphan).toEqual({
                portalDomain: null,
                rqId: 0,
                rqName: null,
                role: null,
                legacyFileId: 0,
                legacyPath: 'clients/other.test/rq/99/stamp/zzz.png',
                status: 'skipped',
                message: MESSAGES.noRecord,
            });
            expect(orphan?.message).toContain('Нет записи в files');
            // строки записей идут раньше строк без записи
            expect(report.rows[report.rows.length - 1]).toBe(orphan);
        });

        it('все файлы без записей: только строки skipped, база не читается дальше', async () => {
            legacy.files.splice(0, legacy.files.length);
            const report = await service.run(
                [{ name: 'clients/a/b.png', buffer: png }],
                false,
            );
            expect(report.rows).toHaveLength(1);
            expect(report.totals.skipped).toBe(1);
            expect(images.rows).toHaveLength(0);
        });
    });

    describe('выбор записей по правилам легаси', () => {
        it('из нескольких записей роли переносится выбранная правилом, остальные skipped с пояснением', async () => {
            legacy.files.push(
                record(150, 'stamp'),
                record(160, 'signature', { code: 'signature' }),
                record(170, 'logo'),
            );

            const report = await service.run(
                uploadOf(legacy.files.filter(file => file.rqId === RQ)),
                false,
            );

            // печать и логотип: наименьший id; подпись руководителя: наибольший
            expect(rowOf(report, 101).status).toBe('imported');
            expect(rowOf(report, 150)).toMatchObject({
                status: 'skipped',
                role: null,
            });
            expect(rowOf(report, 160).status).toBe('imported');
            expect(rowOf(report, 102)).toMatchObject({
                status: 'skipped',
                role: null,
            });
            expect(rowOf(report, 104).status).toBe('imported');
            expect(rowOf(report, 170).status).toBe('skipped');
            expect(
                images.rows.find(image => image.role === 'signature_director')
                    ?.legacyFileId,
            ).toBe(160);
        });
    });

    describe('итоги и порядок', () => {
        it('счётчики сходятся с числом строк', async () => {
            const report = await service.run(
                [
                    ...uploadOf(rqRecords().filter(file => file.id !== 104)),
                    { name: 'clients/x/y.png', buffer: png },
                ],
                false,
            );
            const { totals } = report;
            const sum =
                totals.imported +
                totals.wouldImport +
                totals.exists +
                totals.already +
                totals.noFile +
                totals.skipped +
                totals.error;
            expect(sum).toBe(report.rows.length);
            expect(report.totals).toMatchObject({
                imported: 3,
                noFile: 1,
                skipped: 2,
            });
        });

        it('реквизиты идут по возрастанию rqId', async () => {
            legacy.files.push(record(300, 'stamp', { rqId: OTHER_RQ }));
            const report = await service.run(
                uploadOf([
                    record(300, 'stamp', { rqId: OTHER_RQ }),
                    record(101, 'stamp'),
                ]),
                true,
            );
            expect(report.rows.map(row => row.rqId)).toEqual([
                RQ,
                RQ,
                RQ,
                RQ,
                RQ,
                OTHER_RQ,
            ]);
        });
    });
});
