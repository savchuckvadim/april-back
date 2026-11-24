jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
import { StorageService } from '@lib/core/storage/storage.service';
import { SupplyPayloadEnricherService } from '@app/konstructor/document-generate/supply/supply-payload-enricher.service';
import { ComplectVariantOfferStageService } from '@app/konstructor/modules/complect-variant-lifecycle/services/complect-variant-offer-stage.service';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import {
    BitrixDocumentSaveFlowService,
    IDocumentSaveFlowData,
    IDocumentSaveFlowResult,
} from '@app/konstructor/offer-word/services/bitrix/bitrix-document-save-flow.service';
import { OfferBxTimelineService } from '@app/konstructor/offer-word/services/bitrix/offer-bx-timeline.service';
import { InvoiceDocumentsBuildService } from '@app/konstructor/offer-word/services/invoice-word-core/invoice-documents-build.service';
import { PdfMergeService } from '@app/konstructor/offer-word/services/pdf-export/pdf-merge.service';
import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfDocumentModelService } from '../services/offer-pdf-document-model.service';
import { OfferPdfGenerateService } from '../services/offer-pdf-generate.service';
import {
    OfferPdfRenderResult,
    OfferPdfRenderService,
} from '../services/offer-pdf-render.service';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';
import {
    compositionOf,
    pdfRequestOf,
    variantOf,
} from './fixtures/offer-pdf-variants.fixture';

const SERVER_BASE = 'https://app.test/api/files';
const BITRIX_LINK = 'https://test.bitrix24.ru/disk/file';
const year = String(new Date().getFullYear());

type BitrixMode = 'ok' | 'fallback' | 'throws';

interface SetupOptions {
    bitrix?: BitrixMode;
    /** fails — склейка PDF бросает ошибку */
    merge?: 'ok' | 'fails';
    /** rejects — перевод вариантов в стадию «КП» бросает ошибку */
    stage?: 'ok' | 'rejects';
}

/**
 * Сервис дирижирует тем, что печатать и сколько раз: рендер, склейка и
 * сохранение замоканы — без react-pdf, диска и Битрикса. Рендер отдаёт PDF,
 * по содержимому которого видно, какой вариант напечатан: «pdf:<название>».
 */
const setup = async ({
    bitrix = 'ok',
    merge = 'ok',
    stage = 'ok',
}: SetupOptions = {}) => {
    const build = jest.fn<
        Promise<OfferPdfDocumentModel>,
        [unknown, { variantTitle?: string | null }?]
    >((_input, options) =>
        Promise.resolve(
            createOfferPdfModelFixture({
                variantTitle: options?.variantTitle ?? null,
            }),
        ),
    );

    let inFlight = 0;
    let maxInFlight = 0;
    const render = jest.fn<
        Promise<Partial<OfferPdfRenderResult>>,
        [OfferPdfDocumentModel]
    >(async model => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return {
            buffer: Buffer.from(`pdf:${model.variantTitle ?? '-'}`),
            durationMs: 40,
            templateCode: OfferPdfTemplateCode.CLASSIC,
            missingAssets: ['logos/garant_logo_pink.svg'],
        };
    });

    const mergeBuffers = jest.fn<Promise<Buffer>, [readonly Uint8Array[]]>(
        parts =>
            merge === 'fails'
                ? Promise.reject(new Error('битый PDF'))
                : Promise.resolve(
                      Buffer.from(
                          `merged:${parts.map(part => Buffer.from(part).toString()).join('+')}`,
                      ),
                  ),
    );
    const saveFile = jest.fn<Promise<string>, [Buffer, string, string, string]>(
        (_buffer, fileName) => Promise.resolve(`/abs/${fileName}`),
    );
    const createPublicLink = jest.fn(
        (
            _domain: string,
            _userId: number,
            _app: string,
            _sub: string,
            _year: string,
            fileName: string,
        ) => Promise.resolve(`/api/files/${fileName}`),
    );
    const saveDocuments = jest.fn<
        Promise<IDocumentSaveFlowResult>,
        [IDocumentSaveFlowData]
    >(data => {
        if (bitrix === 'throws') {
            return Promise.reject(new Error('нет доступа к Диску'));
        }
        return Promise.resolve({
            portalFolderId: 1,
            documents: data.documents.map((document, index) => ({
                link:
                    bitrix === 'ok'
                        ? `${BITRIX_LINK}/${index + 1}`
                        : document.link,
                name: document.name,
                type: document.type,
            })),
            files: [],
        });
    });
    const sendDocumentToBitrix = jest.fn<
        Promise<void>,
        [{ dealId?: string; documents: unknown[] }]
    >(() => Promise.resolve());
    const enrichWithVariants = jest.fn((dto: OfferPdfGenerateDto) =>
        Promise.resolve(dto),
    );
    const markOffer = jest.fn(() =>
        stage === 'rejects'
            ? Promise.reject(new Error('смарт не отвечает'))
            : Promise.resolve(),
    );

    const moduleRef = await Test.createTestingModule({
        providers: [
            OfferPdfGenerateService,
            { provide: OfferPdfDocumentModelService, useValue: { build } },
            { provide: OfferPdfRenderService, useValue: { render } },
            { provide: StorageService, useValue: { saveFile } },
            { provide: FileLinkService, useValue: { createPublicLink } },
            {
                provide: ConfigService,
                useValue: { get: jest.fn(() => 'https://app.test') },
            },
            {
                provide: BitrixDocumentSaveFlowService,
                useValue: { saveDocuments },
            },
            {
                provide: OfferBxTimelineService,
                useValue: { sendDocumentToBitrix },
            },
            {
                provide: SupplyPayloadEnricherService,
                useValue: { enrichWithVariants },
            },
            { provide: PdfMergeService, useValue: { mergeBuffers } },
            {
                provide: ComplectVariantOfferStageService,
                useValue: { markOffer },
            },
            // эти запросы без счёта: сервис счетов не вызывается
            {
                provide: InvoiceDocumentsBuildService,
                useValue: { build: jest.fn() },
            },
        ],
    }).compile();

    return {
        service: moduleRef.get(OfferPdfGenerateService),
        build,
        render,
        mergeBuffers,
        saveFile,
        createPublicLink,
        saveDocuments,
        sendDocumentToBitrix,
        enrichWithVariants,
        markOffer,
        maxInFlight: () => maxInFlight,
    };
};

const MULTI = compositionOf(ComplectModeEnum.MULTI_CONTRACT);
const SEPARATE = compositionOf(ComplectModeEnum.MULTI_CONTRACT, {
    separateDocuments: true,
});

const twoVariants = (composition = MULTI): OfferPdfGenerateDto =>
    pdfRequestOf({
        variants: [variantOf('Юрист', 11), variantOf('Бухгалтер', 12)],
        composition,
    });

describe('генерация PDF-КП: запрос без вариантов', () => {
    const dto = pdfRequestOf();

    it('предпросмотр — только рендер, без записи на диск, Битрикса и стадий', async () => {
        const ctx = await setup();
        const result = await ctx.service.preview(dto);

        expect(result.buffer.toString()).toBe('pdf:-');
        expect(ctx.render).toHaveBeenCalledTimes(1);
        expect(ctx.mergeBuffers).not.toHaveBeenCalled();
        expect(ctx.saveFile).not.toHaveBeenCalled();
        expect(ctx.createPublicLink).not.toHaveBeenCalled();
        expect(ctx.saveDocuments).not.toHaveBeenCalled();
        expect(ctx.markOffer).not.toHaveBeenCalled();
    });

    it('печатается как раньше: поля запроса, подписи дополнены один раз, без названия варианта', async () => {
        const ctx = await setup();
        await ctx.service.preview(dto);

        expect(ctx.enrichWithVariants).toHaveBeenCalledTimes(1);
        expect(ctx.enrichWithVariants).toHaveBeenCalledWith(dto);
        expect(ctx.build).toHaveBeenCalledTimes(1);
        const [input, options] = ctx.build.mock.calls[0];
        expect(input).toEqual(expect.objectContaining({ domain: dto.domain }));
        expect(input).toHaveProperty('sets', dto.sets);
        expect(input).toHaveProperty('total', dto.total);
        expect(input).not.toHaveProperty('variants');
        expect(options).toEqual({ variantTitle: null });
    });

    it('генерация кладёт файл в konstructor/offer/<год>/<домен>/<пользователь>, грузит в сделку и пишет в таймлайн', async () => {
        const ctx = await setup();
        const result = await ctx.service.generate(dto);

        expect(ctx.saveFile).toHaveBeenCalledTimes(1);
        const [savedBuffer, fileName, , subPath] = ctx.saveFile.mock.calls[0];
        expect(savedBuffer.toString()).toBe('pdf:-');
        expect(fileName).toMatch(/^offer-[0-9a-f-]{36}\.pdf$/);
        expect(subPath).toBe(`konstructor/offer/${year}/test.bitrix24.ru/15`);
        expect(ctx.createPublicLink).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            15,
            'konstructor',
            'offer',
            year,
            fileName,
        );

        const serverLink = `${SERVER_BASE}/${fileName}`;
        expect(ctx.saveDocuments).toHaveBeenCalledWith({
            domain: 'test.bitrix24.ru',
            companyId: '7',
            userId: 15,
            dealId: '100',
            documents: [
                {
                    absolutePath: `/abs/${fileName}`,
                    link: serverLink,
                    name: 'КП Бухгалтерия - Интернет 3 ОД',
                    type: 'offer',
                },
            ],
            onlyBitrixSave: false,
        });
        expect(ctx.sendDocumentToBitrix).toHaveBeenCalledWith(
            expect.objectContaining({
                dealId: '100',
                documents: [
                    expect.objectContaining({ link: `${BITRIX_LINK}/1` }),
                ],
            }),
        );
        expect(result).toEqual({
            link: serverLink,
            fileName,
            templateCode: OfferPdfTemplateCode.CLASSIC,
            durationMs: 40,
            size: 'pdf:-'.length,
            // чего не хватило стилю — уходит в ответ, фронт предупредит менеджера
            missingAssets: ['logos/garant_logo_pink.svg'],
            savedToDeal: true,
            bitrixLink: `${BITRIX_LINK}/1`,
            dealMessage: null,
            links: [
                {
                    link: serverLink,
                    fileName,
                    name: 'КП Бухгалтерия - Интернет 3 ОД',
                    size: 'pdf:-'.length,
                    bitrixLink: `${BITRIX_LINK}/1`,
                },
            ],
            // счёта в запросе нет — список пуст
            invoiceLinks: [],
            warnings: [],
        });
    });

    it('Диск Битрикса не принял файл — ссылка на сервер остаётся, в ответе причина', async () => {
        const ctx = await setup({ bitrix: 'fallback' });
        const result = await ctx.service.generate(dto);

        expect(result.savedToDeal).toBe(false);
        expect(result.bitrixLink).toBeNull();
        expect(result.dealMessage).toContain('ссылка на сервер');
        expect(ctx.sendDocumentToBitrix).toHaveBeenCalledTimes(1);
    });

    it('ошибка Битрикса не роняет генерацию', async () => {
        const ctx = await setup({ bitrix: 'throws' });
        const result = await ctx.service.generate(dto);

        expect(result.link).toContain(`${SERVER_BASE}/offer-`);
        expect(result.savedToDeal).toBe(false);
        expect(result.dealMessage).toContain('нет доступа к Диску');
        expect(ctx.sendDocumentToBitrix).not.toHaveBeenCalled();
    });

    it('saveToDeal=false — в Битрикс не ходим', async () => {
        const ctx = await setup();
        const result = await ctx.service.generate(
            pdfRequestOf({ saveToDeal: false }),
        );

        expect(ctx.saveDocuments).not.toHaveBeenCalled();
        expect(ctx.sendDocumentToBitrix).not.toHaveBeenCalled();
        expect(result.savedToDeal).toBe(false);
        expect(result.dealMessage).toBeNull();
        expect(result.links).toHaveLength(1);
        expect(result.links?.[0].bitrixLink).toBeNull();
    });
});

describe('генерация PDF-КП: режимы печати вариантов', () => {
    const merged = compositionOf(ComplectModeEnum.SINGLE_CONTRACT, {
        infoblocks: ComplectOfferInfoblocksEnum.MERGED,
    });

    it.each<[string, OfferPdfGenerateDto, number, number, number, number]>([
        // режим, запрос, рендеров, склеек в предпросмотре, склеек в генерации, файлов
        ['single: вариантов нет', pdfRequestOf(), 1, 0, 0, 1],
        [
            'single: вариант один',
            pdfRequestOf({ variants: [variantOf('Юрист', 11)] }),
            1,
            0,
            0,
            1,
        ],
        [
            'compare: настроек сборки нет',
            pdfRequestOf({
                variants: [variantOf('Юрист', 11), variantOf('Бухгалтер', 12)],
            }),
            1,
            0,
            0,
            1,
        ],
        [
            'compare: с показом альтернатив',
            twoVariants(
                compositionOf(ComplectModeEnum.COMPARE, {
                    showAlternatives: true,
                }),
            ),
            1,
            0,
            0,
            1,
        ],
        ['merged: один слитый документ', twoVariants(merged), 1, 0, 0, 1],
        ['independent: склейка в один файл', twoVariants(), 2, 1, 1, 1],
        [
            'independent + separateDocuments: файл на вариант',
            twoVariants(SEPARATE),
            2,
            1,
            0,
            2,
        ],
    ])(
        '%s',
        async (
            _label,
            request,
            renders,
            previewMerges,
            generateMerges,
            files,
        ) => {
            const preview = await setup();
            await preview.service.preview(request);
            expect(preview.render).toHaveBeenCalledTimes(renders);
            expect(preview.mergeBuffers).toHaveBeenCalledTimes(previewMerges);
            expect(preview.saveFile).not.toHaveBeenCalled();

            const generate = await setup();
            const result = await generate.service.generate(request);
            expect(generate.render).toHaveBeenCalledTimes(renders);
            expect(generate.mergeBuffers).toHaveBeenCalledTimes(generateMerges);
            expect(generate.saveFile).toHaveBeenCalledTimes(files);
            expect(result.links).toHaveLength(files);
        },
    );

    it('каждый вариант независимого режима печатается со своим названием, настройки PDF общие', async () => {
        const ctx = await setup();
        const dto = pdfRequestOf({
            variants: [variantOf('Юрист', 11), variantOf('Бухгалтер', 12)],
            composition: MULTI,
            templateCode: OfferPdfTemplateCode.PRISM,
            documentNumber: 'КП-1042',
            settings: { withCover: false },
        });
        await ctx.service.preview(dto);

        expect(
            ctx.build.mock.calls.map(([, options]) => options?.variantTitle),
        ).toEqual(['Юрист', 'Бухгалтер']);
        for (const [input] of ctx.build.mock.calls) {
            expect(input).toHaveProperty(
                'templateCode',
                OfferPdfTemplateCode.PRISM,
            );
            expect(input).toHaveProperty('documentNumber', 'КП-1042');
            expect(input).toHaveProperty('settings', dto.settings);
        }
    });

    it('в остальных режимах название варианта не передаётся', async () => {
        const ctx = await setup();
        await ctx.service.preview(
            twoVariants(compositionOf(ComplectModeEnum.COMPARE)),
        );
        await ctx.service.preview(twoVariants(merged));

        expect(
            ctx.build.mock.calls.map(([, options]) => options?.variantTitle),
        ).toEqual([null, null]);
    });

    it('документы рендерятся по одному: react-pdf тяжёлый, машина общая', async () => {
        const ctx = await setup();
        await ctx.service.preview(twoVariants());
        expect(ctx.maxInFlight()).toBe(1);
    });
});

describe('предпросмотр PDF-КП: независимые варианты', () => {
    it('отдаёт склейку всех вариантов в порядке запроса', async () => {
        const ctx = await setup();
        const result = await ctx.service.preview(twoVariants());

        expect(ctx.mergeBuffers).toHaveBeenCalledTimes(1);
        const [parts] = ctx.mergeBuffers.mock.calls[0];
        expect(parts.map(part => Buffer.from(part).toString())).toEqual([
            'pdf:Юрист',
            'pdf:Бухгалтер',
        ]);
        expect(result.buffer.toString()).toBe('merged:pdf:Юрист+pdf:Бухгалтер');
        expect(result.durationMs).toBe(80);
        expect(result.templateCode).toBe(OfferPdfTemplateCode.CLASSIC);
        // одинаковые пропавшие картинки не повторяются
        expect(result.missingAssets).toEqual(['logos/garant_logo_pink.svg']);
    });

    it('при separateDocuments предпросмотр тоже склеивает: он показывает всё, что будет напечатано', async () => {
        const ctx = await setup();
        const result = await ctx.service.preview(twoVariants(SEPARATE));

        expect(ctx.mergeBuffers).toHaveBeenCalledTimes(1);
        expect(result.buffer.toString()).toBe('merged:pdf:Юрист+pdf:Бухгалтер');
        expect(ctx.saveFile).not.toHaveBeenCalled();
        expect(ctx.markOffer).not.toHaveBeenCalled();
    });

    it('сбой склейки в предпросмотре — ошибка: часть вариантов ввела бы в заблуждение', async () => {
        const ctx = await setup({ merge: 'fails' });
        await expect(ctx.service.preview(twoVariants())).rejects.toThrow(
            'битый PDF',
        );
    });
});

describe('генерация PDF-КП: независимые варианты', () => {
    it('склеивает варианты в один файл: на Диск и в таймлайн уходит он один', async () => {
        const ctx = await setup();
        const result = await ctx.service.generate(twoVariants());

        expect(ctx.saveFile).toHaveBeenCalledTimes(1);
        expect(ctx.saveFile.mock.calls[0][0].toString()).toBe(
            'merged:pdf:Юрист+pdf:Бухгалтер',
        );
        const [{ documents }] = ctx.saveDocuments.mock.calls[0];
        expect(documents).toHaveLength(1);
        // имя склейки — по первому варианту, как у Word-КП
        expect(documents[0].name).toBe('КП Юрист - Интернет 3 ОД');
        expect(ctx.sendDocumentToBitrix).toHaveBeenCalledTimes(1);
        expect(result.links).toHaveLength(1);
        expect(result.warnings).toEqual([]);
        expect(result.durationMs).toBe(80);
    });

    it('при separateDocuments — файл на вариант, все уходят на Диск и в таймлайн', async () => {
        const ctx = await setup();
        const result = await ctx.service.generate(twoVariants(SEPARATE));

        expect(ctx.mergeBuffers).not.toHaveBeenCalled();
        expect(
            ctx.saveFile.mock.calls.map(([buffer]) => buffer.toString()),
        ).toEqual(['pdf:Юрист', 'pdf:Бухгалтер']);

        const [{ documents }] = ctx.saveDocuments.mock.calls[0];
        expect(documents.map(document => document.name)).toEqual([
            'КП Юрист - Интернет 3 ОД',
            'КП Бухгалтер - Интернет 3 ОД',
        ]);
        const [timeline] = ctx.sendDocumentToBitrix.mock.calls[0];
        expect(timeline.documents).toHaveLength(2);

        expect(result.links?.map(file => file.name)).toEqual([
            'КП Юрист - Интернет 3 ОД',
            'КП Бухгалтер - Интернет 3 ОД',
        ]);
        expect(result.links?.map(file => file.bitrixLink)).toEqual([
            `${BITRIX_LINK}/1`,
            `${BITRIX_LINK}/2`,
        ]);
        // поля с одной ссылкой указывают на первый файл
        expect(result.link).toBe(result.links?.[0].link);
        expect(result.fileName).toBe(result.links?.[0].fileName);
        expect(result.size).toBe(result.links?.[0].size);
        expect(result.bitrixLink).toBe(`${BITRIX_LINK}/1`);
        expect(result.savedToDeal).toBe(true);
        expect(result.dealMessage).toBeNull();
        expect(result.links?.[0].link).not.toBe(result.links?.[1].link);
    });

    it('сбой склейки не роняет генерацию: файлы отдаются по одному, в ответе предупреждение', async () => {
        const ctx = await setup({ merge: 'fails' });
        const result = await ctx.service.generate(twoVariants());

        expect(ctx.mergeBuffers).toHaveBeenCalledTimes(1);
        expect(ctx.saveFile).toHaveBeenCalledTimes(2);
        expect(result.links).toHaveLength(2);
        expect(result.warnings).toEqual([
            'PDF вариантов не склеились: файлы отданы по одному',
        ]);
        expect(ctx.markOffer).toHaveBeenCalledTimes(1);
    });

    it('часть файлов не попала на Диск Битрикса — в ответе сколько и почему', async () => {
        const ctx = await setup({ bitrix: 'fallback' });
        const result = await ctx.service.generate(twoVariants(SEPARATE));

        expect(result.savedToDeal).toBe(false);
        expect(result.bitrixLink).toBeNull();
        expect(result.dealMessage).toContain('0 из 2 файлов');
        expect(result.links?.every(file => file.bitrixLink === null)).toBe(
            true,
        );
    });
});

describe('генерация PDF-КП: merged', () => {
    it('предупреждения слияния попадают в ответ', async () => {
        const ctx = await setup();
        const result = await ctx.service.generate(
            pdfRequestOf({
                variants: [
                    variantOf('Юрист', 11, { quantity: 12 }),
                    variantOf('Бухгалтер', 12, { quantity: 6 }),
                ],
                composition: compositionOf(ComplectModeEnum.SINGLE_CONTRACT, {
                    infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                }),
            }),
        );

        expect(ctx.render).toHaveBeenCalledTimes(1);
        expect(result.links).toHaveLength(1);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings?.[0]).toContain('срок набора');
    });
});

describe('генерация PDF-КП: стадия «КП» вариантам', () => {
    it('ставится после генерации: варианты из запроса переводятся тем же вызовом, что у Word', async () => {
        const ctx = await setup();
        const dto = twoVariants();
        await ctx.service.generate(dto);

        expect(ctx.markOffer).toHaveBeenCalledTimes(1);
        expect(ctx.markOffer).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            dto.variants,
        );
        // файл уже записан, когда варианты переводятся в «КП»
        expect(ctx.saveFile.mock.invocationCallOrder[0]).toBeLessThan(
            ctx.markOffer.mock.invocationCallOrder[0],
        );
    });

    it('не ставится после предпросмотра', async () => {
        const ctx = await setup();
        await ctx.service.preview(twoVariants());
        await ctx.service.preview(pdfRequestOf());

        expect(ctx.markOffer).not.toHaveBeenCalled();
    });

    it('сбой перевода в стадию не роняет генерацию', async () => {
        const ctx = await setup({ stage: 'rejects' });
        const result = await ctx.service.generate(twoVariants());

        expect(ctx.markOffer).toHaveBeenCalledTimes(1);
        expect(result.links).toHaveLength(1);
    });

    it('ставится и при saveToDeal=false: КП сформировано', async () => {
        const ctx = await setup();
        await ctx.service.generate({ ...twoVariants(), saveToDeal: false });

        expect(ctx.markOffer).toHaveBeenCalledTimes(1);
    });
});
