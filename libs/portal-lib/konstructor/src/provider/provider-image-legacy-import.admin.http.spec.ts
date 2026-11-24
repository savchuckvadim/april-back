/**
 * Временная админ-ручка переноса картинок поставщика из легаси на настоящем
 * Nest-приложении: multipart через multer (поле `files`, имена с путями),
 * лимиты на интерсепторе, разбор dryRun, Swagger. Репозитории — в памяти,
 * файлы пишутся во временный storage.
 */

import { existsSync } from 'fs';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type {
    OperationObject,
    ParameterObject,
    RequestBodyObject,
    ResponseObject,
    SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
    ProviderImageRepository,
    ProviderImageService,
    ProviderImageStorage,
} from '../provider-image';
import { LegacyRqFile } from '../provider-image/legacy-import/legacy-rq-file.entity';
import { LegacyRqFileRepository } from '../provider-image/legacy-import/legacy-rq-file.repository';
import { PROVIDER_IMAGE_LEGACY_IMPORT_MESSAGES as MESSAGES } from '../provider-image/legacy-import/provider-image-legacy-import.messages';
import { ProviderImageLegacyImportService } from '../provider-image/legacy-import/provider-image-legacy-import.service';
import {
    PROVIDER_IMAGE_LEGACY_IMPORT_MAX_BYTES,
    ProviderImageLegacyImportReport,
} from '../provider-image/legacy-import/provider-image-legacy-import.types';
import { MemoryLegacyRqFileRepository } from '../provider-image/legacy-import/__tests__/memory-legacy-rq-file.repository';
import { MemoryProviderImageRepository } from '../provider-image/__tests__/memory-provider-image.repository';
import {
    createTempStorage,
    makePng,
    TempStorage,
} from '../provider-image/__tests__/support/image-fixtures';
import { ProviderImageLegacyImportAdminController } from './provider-image-legacy-import.admin.controller';

const RQ = 15;
const DOMAIN = 'garant.test';
const URL = '/admin/portal/provider/images/legacy-import';

const STAMP_PATH = `clients/${DOMAIN}/rq/${RQ}/stamp/${RQ}_stamp_stamp_a1.png`;
const LOGO_PATH = `clients/${DOMAIN}/rq/${RQ}/logo/${RQ}_logo_logo_b2.png`;

const legacyRecords = (): LegacyRqFile[] => [
    {
        id: 101,
        rqId: RQ,
        parentType: 'stamp',
        code: 'stamp',
        path: STAMP_PATH,
    },
    { id: 104, rqId: RQ, parentType: 'logo', code: 'logo', path: LOGO_PATH },
];

/**
 * Файл с относительным путём в имени, как его шлёт браузер при выборе папки.
 * Без `filepath` клиент запроса оставил бы в имени только название файла.
 */
const attachWithPath = (
    req: request.Test,
    field: string,
    buffer: Buffer,
    path: string,
): void => {
    // `filepath` понимает form-data под superagent, а в типах его нет
    const options: { filename: string; filepath: string } = {
        filename: path,
        filepath: path,
    };
    req.attach(field, buffer, options);
};

const messageOf = (res: request.Response): string =>
    (res.body as { message: string }).message;

describe('админ-ручка переноса картинок поставщика из легаси', () => {
    let temp: TempStorage;
    let app: INestApplication<App>;
    let images: MemoryProviderImageRepository;
    let legacy: MemoryLegacyRqFileRepository;
    let png: Buffer;

    beforeAll(async () => {
        png = await makePng(40, 20);
    });

    beforeEach(async () => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        temp = createTempStorage();
        images = new MemoryProviderImageRepository([RQ]);
        legacy = new MemoryLegacyRqFileRepository(legacyRecords(), [
            { rqId: RQ, rqName: 'ООО Ромашка', portalDomain: DOMAIN },
        ]);
        const moduleRef = await Test.createTestingModule({
            controllers: [ProviderImageLegacyImportAdminController],
            providers: [
                ProviderImageLegacyImportService,
                ProviderImageService,
                { provide: ProviderImageStorage, useValue: temp.storage },
                { provide: ProviderImageRepository, useValue: images },
                { provide: LegacyRqFileRepository, useValue: legacy },
            ],
        }).compile();
        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({ whitelist: true, transform: true }),
        );
        await app.init();
    });

    afterEach(async () => {
        await app.close();
        temp.cleanup();
        jest.restoreAllMocks();
    });

    const post = (query: string, ...files: [string, Buffer][]) => {
        const req = request(app.getHttpServer()).post(`${URL}${query}`);
        for (const [name, buffer] of files)
            attachWithPath(req, 'files', buffer, name);
        return req;
    };

    const reportOf = (res: request.Response): ProviderImageLegacyImportReport =>
        res.body as ProviderImageLegacyImportReport;

    it('проверка: имена файлов с путями доходят до сервиса, ответ 200 с отчётом, ничего не записано', async () => {
        const res = await post(
            '?dryRun=true',
            [STAMP_PATH, png],
            [LOGO_PATH, png],
        ).expect(200);

        const report = reportOf(res);
        expect(report.dryRun).toBe(true);
        expect(report.totals).toEqual({
            imported: 0,
            wouldImport: 2,
            exists: 0,
            already: 0,
            noFile: 0,
            skipped: 0,
            error: 0,
        });
        expect(report.rows).toEqual([
            {
                portalDomain: DOMAIN,
                rqId: RQ,
                rqName: 'ООО Ромашка',
                role: 'stamp',
                legacyFileId: 101,
                legacyPath: STAMP_PATH,
                status: 'would-import',
                message: MESSAGES.wouldImport('stamp'),
            },
            expect.objectContaining({
                role: 'logo',
                legacyFileId: 104,
                status: 'would-import',
            }),
        ]);
        expect(images.rows).toHaveLength(0);
        expect(existsSync(temp.fullPath(''))).toBe(false);
    });

    it('multer не обрезает путь: имя файла с папками доходит до сервиса целиком', async () => {
        const run = jest.spyOn(
            app.get(ProviderImageLegacyImportService),
            'run',
        );

        await post(
            '?dryRun=true',
            [`backup/${STAMP_PATH}`, png],
            [LOGO_PATH, png],
        ).expect(200);

        expect(run).toHaveBeenCalledTimes(1);
        const [files, dryRun] = run.mock.calls[0];
        expect(files.map(file => file.name)).toEqual([
            `backup/${STAMP_PATH}`,
            LOGO_PATH,
        ]);
        expect(dryRun).toBe(true);
    });

    it('полный путь сопоставляется с files.path точно, даже когда базовые имена совпадают', async () => {
        const SAME = 'same_name.png';
        legacy.files.push(
            {
                id: 201,
                rqId: RQ,
                parentType: 'qr',
                code: 'qr',
                path: `clients/a.test/rq/${RQ}/qr/${SAME}`,
            },
            {
                id: 202,
                rqId: RQ,
                parentType: 'qr',
                code: 'qr',
                path: `clients/b.test/rq/${RQ}/qr/${SAME}`,
            },
        );

        // с путём запись находится однозначно
        const full = reportOf(
            await post('?dryRun=true', [
                `clients/a.test/rq/${RQ}/qr/${SAME}`,
                png,
            ]).expect(200),
        );
        expect(full.rows.some(row => row.legacyFileId === 0)).toBe(false);
        expect(full.rows.find(row => row.legacyFileId === 201)?.status).toBe(
            'skipped',
        );

        // без пути (старый клиент) имя неоднозначно: skipped с пояснением
        const bare = reportOf(
            await post('?dryRun=true', [SAME, png]).expect(200),
        );
        expect(bare.rows).toHaveLength(1);
        expect(bare.rows[0]).toMatchObject({
            status: 'skipped',
            legacyFileId: 0,
            legacyPath: SAME,
            message: MESSAGES.ambiguous([201, 202]),
        });
    });

    it('старый клиент прислал только базовое имя: однозначная запись находится', async () => {
        const report = reportOf(
            await post('?dryRun=false', [
                `${RQ}_stamp_stamp_a1.png`,
                png,
            ]).expect(200),
        );
        expect(report.rows.find(row => row.legacyFileId === 101)?.status).toBe(
            'imported',
        );
        expect(images.rows.map(row => row.legacyFileId)).toEqual([101]);
    });

    it('перенос: dryRun=false пишет картинки с legacyFileId, повтор отвечает already', async () => {
        const first = reportOf(
            await post(
                '?dryRun=false',
                [`backup/${STAMP_PATH}`, png],
                [LOGO_PATH, png],
            ).expect(200),
        );
        expect(first.dryRun).toBe(false);
        expect(first.totals.imported).toBe(2);
        expect(
            images.rows.map(row => [row.role, row.legacyFileId]).sort(),
        ).toEqual([
            ['logo', 104],
            ['stamp', 101],
        ]);

        const second = reportOf(
            await post(
                '?dryRun=false',
                [STAMP_PATH, png],
                [LOGO_PATH, png],
            ).expect(200),
        );
        expect(second.totals.already).toBe(2);
        expect(images.rows).toHaveLength(2);
    });

    it('без dryRun выполняется только проверка, записи нет', async () => {
        const report = reportOf(await post('', [STAMP_PATH, png]).expect(200));
        expect(report.dryRun).toBe(true);
        expect(images.rows).toHaveLength(0);
    });

    it('неверное значение dryRun — 400 с текстом по-русски', async () => {
        const res = await post('?dryRun=maybe', [STAMP_PATH, png]).expect(400);
        expect(messageOf(res)).toBe(MESSAGES.badDryRun);
    });

    it('ошибка картинки остаётся в строке отчёта, ответ 200', async () => {
        const report = reportOf(
            await post(
                '?dryRun=false',
                [STAMP_PATH, Buffer.from('<html></html>')],
                [LOGO_PATH, png],
            ).expect(200),
        );
        expect(report.totals).toMatchObject({ error: 1, imported: 1 });
        expect(report.rows[0]).toMatchObject({
            role: 'stamp',
            status: 'error',
        });
        expect(report.rows[0].message).toContain('PNG или JPG');
    });

    it('файл без записи в files попадает в отчёт', async () => {
        const report = reportOf(
            await post('?dryRun=true', ['clients/x/zzz.png', png]).expect(200),
        );
        expect(report.rows).toHaveLength(1);
        expect(report.rows[0]).toMatchObject({
            status: 'skipped',
            role: null,
            legacyFileId: 0,
            legacyPath: 'clients/x/zzz.png',
        });
    });

    it('запрос без файлов — 400', async () => {
        const res = await request(app.getHttpServer())
            .post(`${URL}?dryRun=true`)
            .field('comment', 'без файлов')
            .expect(400);
        expect(messageOf(res)).toBe(MESSAGES.noFiles);
    });

    it('файл в чужом поле — 400 с русским текстом', async () => {
        const res = await request(app.getHttpServer())
            .post(`${URL}?dryRun=true`)
            .attach('file', png, STAMP_PATH)
            .expect(400);
        expect(messageOf(res)).toBe(MESSAGES.badUpload);
    });

    it('101 файл — 400 с русским текстом', async () => {
        const req = request(app.getHttpServer()).post(`${URL}?dryRun=true`);
        for (let index = 0; index < 101; index += 1) {
            attachWithPath(req, 'files', png, `clients/x/${index}.png`);
        }
        const res = await req.expect(400);
        expect(messageOf(res)).toBe(MESSAGES.badUpload);
    });

    it('100 файлов принимаются', async () => {
        const req = request(app.getHttpServer()).post(`${URL}?dryRun=true`);
        for (let index = 0; index < 100; index += 1) {
            attachWithPath(req, 'files', png, `clients/x/${index}.png`);
        }
        const res = await req.expect(200);
        expect(reportOf(res).rows).toHaveLength(100);
    });

    it('файл больше 10 МБ — 400 с текстом по-русски', async () => {
        const huge = Buffer.alloc(
            PROVIDER_IMAGE_LEGACY_IMPORT_MAX_BYTES + 1,
            0,
        );
        const res = await post('?dryRun=true', [STAMP_PATH, huge]).expect(400);
        expect(messageOf(res)).toBe(MESSAGES.fileTooLarge);
    });

    it('файл крупнее 2 МБ, но не больше 10 МБ, доходит до отчёта: ошибка в строке', async () => {
        const big = Buffer.concat([png, Buffer.alloc(3 * 1024 * 1024, 0)]);
        const report = reportOf(
            await post('?dryRun=false', [STAMP_PATH, big]).expect(200),
        );
        expect(report.rows[0]).toMatchObject({ status: 'error' });
        expect(report.rows[0].message).toContain('2 МБ');
    });

    it('Swagger: POST multipart с полем files, query dryRun, ответ с DTO отчёта', () => {
        const document = SwaggerModule.createDocument(
            app,
            new DocumentBuilder().build(),
            {
                operationIdFactory: (
                    controllerKey: string,
                    methodKey: string,
                ) =>
                    `${controllerKey.replace(/Controller$/i, '')}_${methodKey}`,
            },
        );
        const operation: OperationObject | undefined =
            document.paths['/admin/portal/provider/images/legacy-import']?.post;
        expect(operation?.operationId).toBe(
            'ProviderImageLegacyImportAdmin_legacyImportImages',
        );
        expect(operation?.tags).toEqual(['Admin Portal Provider']);

        const body = operation?.requestBody as RequestBodyObject | undefined;
        expect(Object.keys(body?.content ?? {})).toEqual([
            'multipart/form-data',
        ]);

        const dryRun = (operation?.parameters ?? []).find(
            (parameter): parameter is ParameterObject =>
                'name' in parameter && parameter.name === 'dryRun',
        );
        expect(dryRun).toMatchObject({
            in: 'query',
            required: false,
            schema: { type: 'boolean' },
        });

        const ok = operation?.responses['200'] as ResponseObject | undefined;
        expect(ok?.content?.['application/json']?.schema).toEqual({
            $ref: '#/components/schemas/ProviderImageLegacyImportReportDto',
        });
        expect(operation?.responses).toHaveProperty('400');

        const schemas = document.components?.schemas ?? {};
        const upload = schemas.ProviderImageLegacyImportUploadDto as
            | SchemaObject
            | undefined;
        expect(upload?.properties?.files).toMatchObject({
            type: 'array',
            items: { type: 'string', format: 'binary' },
        });
        expect(schemas).toHaveProperty('ProviderImageLegacyImportRowDto');
        expect(schemas).toHaveProperty('ProviderImageLegacyImportTotalsDto');
        expect(schemas).toHaveProperty('ProviderImageLegacyImportStatus');

        const report = schemas.ProviderImageLegacyImportReportDto as
            | SchemaObject
            | undefined;
        expect(Object.keys(report?.properties ?? {})).toEqual([
            'dryRun',
            'rows',
            'totals',
        ]);
        const row = schemas.ProviderImageLegacyImportRowDto as
            | SchemaObject
            | undefined;
        expect(Object.keys(row?.properties ?? {})).toEqual([
            'portalDomain',
            'rqId',
            'rqName',
            'role',
            'legacyFileId',
            'legacyPath',
            'status',
            'message',
        ]);
        expect(schemas.ProviderImageLegacyImportStatus).toMatchObject({
            enum: [
                'imported',
                'would-import',
                'exists',
                'already',
                'no-file',
                'skipped',
                'error',
            ],
        });
    });
});
