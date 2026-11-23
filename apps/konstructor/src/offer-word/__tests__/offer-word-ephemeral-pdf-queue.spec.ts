import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Job } from 'bull';
import { RedisService } from '@lib/core/redis/redis.service';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ComplectModeEnum } from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { LibreOfficeBusyError } from '@app/konstructor/modules/libre-office';
import {
    OFFER_WORD_EPHEMERAL_PDF_CANCEL_TTL_SEC,
    OFFER_WORD_EPHEMERAL_PDF_JOB_OPTIONS,
    OFFER_WORD_EPHEMERAL_PDF_REDIS_TTL_SEC,
    offerWordEphemeralPdfCancelRedisKey,
    offerWordEphemeralPdfResultRedisKey,
} from '../constants/offer-word-ephemeral-pdf.constants';
import { OfferWordEphemeralPdfStatusEnum } from '../dto/offer-word-ephemeral-pdf.dto';
import { OfferWordPdfPreviewRequestDto } from '../dto/offer-word-pdf-preview-request.dto';
import {
    OfferWordEphemeralPdfJobPayload,
    OfferWordEphemeralPdfProcessor,
} from '../queue/offer-word-ephemeral-pdf.processor';
import { OfferWordEphemeralPdfDocumentService } from '../services/preview-generate/offer-word-ephemeral-pdf-document.service';
import { OfferWordCancelWatcher } from '../services/queue/offer-word-cancel-watcher.service';
import { OfferWordEphemeralPdfQueueService } from '../services/queue/offer-word-ephemeral-pdf-queue.service';
import {
    previewComposition,
    previewRequest,
    previewVariant,
} from './offer-word-preview.fixtures';

/**
 * Превью с вариантами проходит всю цепочку: ручка → очередь (JSON в Redis) →
 * воркер → сборка документа → результат в Redis → опрос. Redis, Bull и сборка
 * замоканы, поэтому видно, что именно уезжает в очередь и что приходит в
 * воркер.
 */
const MERGE_FAILURE =
    'Не удалось склеить PDF вариантов для превью: pdf-lib: битый файл';

type BuiltPdf = { pdfBuffer: Buffer; pdfFileName: string };

/** Часть интерфейса как весь: достаточно того, что читает проверяемый код. */
const partialOf = <T extends object>(part: Partial<T>): T => part as T;

const withVariants = (): OfferWordPdfPreviewRequestDto =>
    previewRequest({
        variants: [
            previewVariant('Юрист', CONTRACT_LTYPE.ABON),
            previewVariant('Бухгалтер', CONTRACT_LTYPE.LIC),
        ],
        composition: previewComposition(ComplectModeEnum.MULTI_CONTRACT, {
            separateDocuments: true,
        }),
    });

const setup = async () => {
    const store = new Map<string, string>();
    const redis = {
        get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        set: jest.fn((key: string, value: string) => {
            store.set(key, value);
            return Promise.resolve('OK');
        }),
        del: jest.fn((key: string) => {
            store.delete(key);
            return Promise.resolve(1);
        }),
    };

    const queueDispatcher = {
        dispatch: jest.fn<
            Promise<void>,
            [
                QueueNames,
                JobNames,
                OfferWordEphemeralPdfJobPayload,
                string,
                typeof OFFER_WORD_EPHEMERAL_PDF_JOB_OPTIONS,
            ]
        >(() => Promise.resolve()),
        getJob: jest.fn(),
    };
    const buildPdf = jest.fn<
        Promise<BuiltPdf>,
        [OfferWordPdfPreviewRequestDto, AbortSignal | undefined]
    >();
    const signal = new AbortController().signal;
    const stopWatch = jest.fn();
    const watch = jest.fn(() => ({ signal, stop: stopWatch }));

    const moduleRef = await Test.createTestingModule({
        providers: [
            OfferWordEphemeralPdfQueueService,
            OfferWordEphemeralPdfProcessor,
            { provide: QueueDispatcherService, useValue: queueDispatcher },
            { provide: RedisService, useValue: { getClient: () => redis } },
            {
                provide: OfferWordEphemeralPdfDocumentService,
                useValue: { buildPdfBufferRemovingFiles: buildPdf },
            },
            { provide: OfferWordCancelWatcher, useValue: { watch } },
        ],
    }).compile();

    /** Данные задания глазами воркера: Bull хранит их в Redis как JSON. */
    const dispatchedPayload = (): OfferWordEphemeralPdfJobPayload =>
        JSON.parse(
            JSON.stringify(queueDispatcher.dispatch.mock.calls[0][2]),
        ) as OfferWordEphemeralPdfJobPayload;

    return {
        queue: moduleRef.get(OfferWordEphemeralPdfQueueService),
        processor: moduleRef.get(OfferWordEphemeralPdfProcessor),
        redis,
        store,
        queueDispatcher,
        buildPdf,
        signal,
        stopWatch,
        dispatchedPayload,
    };
};

const jobOf = (data: OfferWordEphemeralPdfJobPayload) => {
    const discard = jest.fn(() => Promise.resolve());
    return {
        discard,
        job: partialOf<Job<OfferWordEphemeralPdfJobPayload>>({
            data,
            discard,
        }),
    };
};

describe('превью КП с вариантами: путь через очередь', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('запуск ставит задание превью с вариантами и настройками сборки', async () => {
        const { queue, queueDispatcher } = await setup();
        const dto = withVariants();

        const operationId = await queue.start(dto);

        expect(queueDispatcher.dispatch).toHaveBeenCalledTimes(1);
        expect(queueDispatcher.dispatch).toHaveBeenCalledWith(
            QueueNames.OFFER_WORD_EPHEMERAL_PDF,
            JobNames.OFFER_WORD_EPHEMERAL_PDF_GENERATE,
            { dto, operationId },
            operationId,
            OFFER_WORD_EPHEMERAL_PDF_JOB_OPTIONS,
        );
        const sent = queueDispatcher.dispatch.mock.calls[0][2];
        expect(sent.dto.variants).toHaveLength(2);
        expect(sent.dto.composition?.mode).toBe(
            ComplectModeEnum.MULTI_CONTRACT,
        );
    });

    it('данные задания переживают JSON без потерь: варианты и настройки доезжают до воркера', async () => {
        const { queue, queueDispatcher, dispatchedPayload } = await setup();

        await queue.start(withVariants());

        const sent = queueDispatcher.dispatch.mock.calls[0][2];
        const delivered = dispatchedPayload();
        expect(delivered).toEqual(sent);
        expect(delivered.dto.variants?.map(variant => variant.title)).toEqual([
            'Юрист',
            'Бухгалтер',
        ]);
        expect(delivered.dto.variants?.[1].contractType).toBe(
            CONTRACT_LTYPE.LIC,
        );
        expect(delivered.dto.variants?.[0].total.name).toBe('Итого Юрист');
        expect(delivered.dto.composition?.offer.separateDocuments).toBe(true);
    });

    it('воркер отдаёт сборке варианты из задания и кладёт PDF в Redis, опрос возвращает его', async () => {
        const {
            queue,
            processor,
            redis,
            queueDispatcher,
            buildPdf,
            signal,
            stopWatch,
            dispatchedPayload,
        } = await setup();
        const operationId = await queue.start(withVariants());
        const payload = dispatchedPayload();
        buildPdf.mockResolvedValue({
            pdfBuffer: Buffer.from('склеенный PDF'),
            pdfFileName: 'offer-merged.pdf',
        });

        await processor.handle(jobOf(payload).job);

        expect(buildPdf).toHaveBeenCalledTimes(1);
        const [received, receivedSignal] = buildPdf.mock.calls[0];
        expect(received.variants).toHaveLength(2);
        expect(received.composition?.mode).toBe(
            ComplectModeEnum.MULTI_CONTRACT,
        );
        expect(receivedSignal).toBe(signal);
        expect(redis.set).toHaveBeenCalledWith(
            offerWordEphemeralPdfResultRedisKey(operationId),
            JSON.stringify({
                pdfBase64: Buffer.from('склеенный PDF').toString('base64'),
                fileName: 'offer-merged.pdf',
                mimeType: 'application/pdf',
            }),
            'EX',
            OFFER_WORD_EPHEMERAL_PDF_REDIS_TTL_SEC,
        );
        expect(stopWatch).toHaveBeenCalledTimes(1);

        queueDispatcher.getJob.mockResolvedValue({
            getState: () => Promise.resolve('completed'),
        });
        const polled = await queue.poll(operationId);
        expect(polled.status).toBe(OfferWordEphemeralPdfStatusEnum.READY);
        expect(polled.pdfBase64).toBe(
            Buffer.from('склеенный PDF').toString('base64'),
        );
        expect(polled.fileName).toBe('offer-merged.pdf');
        expect(polled.mimeType).toBe('application/pdf');
    });

    it('сбой склейки — воркер снимает задание с повторов, опрос отдаёт failed с понятным текстом', async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        const {
            queue,
            processor,
            redis,
            queueDispatcher,
            buildPdf,
            stopWatch,
            dispatchedPayload,
        } = await setup();
        const operationId = await queue.start(withVariants());
        buildPdf.mockRejectedValue(new Error(MERGE_FAILURE));
        const { job, discard } = jobOf(dispatchedPayload());

        await expect(processor.handle(job)).rejects.toThrow(MERGE_FAILURE);

        // повтор склейки не поможет: задание не должно жечь конвертацию трижды
        expect(discard).toHaveBeenCalledTimes(1);
        expect(redis.set).not.toHaveBeenCalled();
        expect(stopWatch).toHaveBeenCalledTimes(1);

        // Bull переводит задание в failed с текстом ошибки
        queueDispatcher.getJob.mockResolvedValue({
            getState: () => Promise.resolve('failed'),
            failedReason: MERGE_FAILURE,
        });
        const polled = await queue.poll(operationId);
        expect(polled.status).toBe(OfferWordEphemeralPdfStatusEnum.FAILED);
        expect(polled.error).toBe(MERGE_FAILURE);
        expect(polled.pdfBase64).toBeUndefined();
    });

    it('перегруз пула конвертации оставляет задание в повторах', async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        const { queue, processor, buildPdf, dispatchedPayload } = await setup();
        await queue.start(withVariants());
        buildPdf.mockRejectedValue(new LibreOfficeBusyError(5, 5));
        const { job, discard } = jobOf(dispatchedPayload());

        await expect(processor.handle(job)).rejects.toBeInstanceOf(
            LibreOfficeBusyError,
        );

        expect(discard).not.toHaveBeenCalled();
    });

    it('отмена до начала работы — сборка не запускается', async () => {
        const { queue, processor, redis, store, buildPdf, dispatchedPayload } =
            await setup();
        const operationId = await queue.start(withVariants());
        store.set(offerWordEphemeralPdfCancelRedisKey(operationId), '1');
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        const { job, discard } = jobOf(dispatchedPayload());

        await expect(processor.handle(job)).rejects.toThrow(
            'Операция отменена клиентом',
        );

        expect(buildPdf).not.toHaveBeenCalled();
        expect(redis.set).not.toHaveBeenCalled();
        expect(discard).toHaveBeenCalledTimes(1);
    });

    it('опрос: задание в работе — pending, неизвестная операция — 404', async () => {
        const { queue, queueDispatcher } = await setup();

        queueDispatcher.getJob.mockResolvedValue({
            getState: () => Promise.resolve('active'),
        });
        expect((await queue.poll('op-1')).status).toBe(
            OfferWordEphemeralPdfStatusEnum.PENDING,
        );

        queueDispatcher.getJob.mockResolvedValue(undefined);
        await expect(queue.poll('op-2')).rejects.toThrow(
            'Operation op-2 not found or expired',
        );
    });

    it('отмена ждущего задания: флаг в Redis, результат сброшен, задание снято с очереди', async () => {
        const { queue, redis, store, queueDispatcher } = await setup();
        const remove = jest.fn(() => Promise.resolve());
        queueDispatcher.getJob.mockResolvedValue({
            getState: () => Promise.resolve('waiting'),
            remove,
        });
        store.set(offerWordEphemeralPdfResultRedisKey('op-1'), '{"готово":1}');

        const stopped = await queue.stop('op-1');

        expect(redis.set).toHaveBeenCalledWith(
            offerWordEphemeralPdfCancelRedisKey('op-1'),
            '1',
            'EX',
            OFFER_WORD_EPHEMERAL_PDF_CANCEL_TTL_SEC,
        );
        expect(store.has(offerWordEphemeralPdfResultRedisKey('op-1'))).toBe(
            false,
        );
        expect(remove).toHaveBeenCalledTimes(1);
        expect(stopped.cancelled).toBe(true);
        expect(stopped.message).toBe('Задача снята с очереди');
    });
});
