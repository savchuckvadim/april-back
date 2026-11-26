import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { AxiosError } from 'axios';
import { noteBitrixCallMethod } from '@lib/bitrix/core/base/bitrix-error-method.util';
import {
    noteOfferFailureFile,
    noteOfferFailureStep,
} from '../lib/offer-generation-failure.util';
import {
    OfferGenerateJobPayload,
    OfferGenerateProcessor,
} from '../queue/offer-generate.processor';
import type { OfferWordByTemplateGenerateUseCase } from '../use-cases/offer-word-by-template-generate.use-case';
import {
    OfferGenerateMultiJobPayload,
    OfferGenerateMultiProcessor,
} from '../multi/queue/offer-generate-multi.processor';
import type { OfferWordMultiGenerateUseCase } from '../multi/use-cases/offer-word-multi-generate.use-case';

/**
 * Строка «Генерация КП: провал …» в журнале (gsirk, 26.11.2026): раньше в
 * ней было одно «Request failed with status code 400» без шага, метода
 * Битрикса и размера файла.
 */

/** Отказ Диска на загрузке файла, как его бросает наш клиент Битрикса. */
const diskSaveFailure = (): Error => {
    const error = new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
            status: 400,
            statusText: '',
            headers: {},
            config: {} as never,
            data: {
                error: 'DISK_FOLDER_22002',
                error_description:
                    'Не удалось сохранить файл. (DISK_FOLDER_22002).',
            },
        },
    );
    noteBitrixCallMethod(error, 'disk.folder.uploadfile');
    noteOfferFailureStep(error, 'upload');
    noteOfferFailureFile(error, { name: 'КП.pdf', sizeBytes: 48213 });
    return error;
};

const errorLines = (spy: jest.SpyInstance): string[] =>
    spy.mock.calls.map(([line]: [string]) => line);

describe('процессоры генерации КП: строка провала в журнале', () => {
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('легаси-путь: шаг, метод и ответ Битрикса, имя и размер файла, исходное сообщение в конце', async () => {
        const failure = diskSaveFailure();
        const execute = jest.fn().mockRejectedValue(failure);
        const processor = new OfferGenerateProcessor({
            execute,
        } as unknown as OfferWordByTemplateGenerateUseCase);
        const job = {
            id: 'op-1',
            data: {
                dto: {
                    domain: 'gsirk.bitrix24.ru',
                    dealId: '281275',
                    templateId: '4',
                },
            },
        } as unknown as Job<OfferGenerateJobPayload>;

        await expect(processor.handle(job)).rejects.toBe(failure);

        const [line] = errorLines(errorSpy);
        expect(line).toMatch(
            /^Генерация КП: провал operationId=op-1 domain=gsirk\.bitrix24\.ru dealId=281275 templateId=4 durationMs=\d+ /,
        );
        expect(line).toContain(
            ' step=upload bitrixMethod=disk.folder.uploadfile bitrixStatus=400 bitrixCode=DISK_FOLDER_22002 ',
        );
        expect(line).toContain(
            'bitrixDescription="Не удалось сохранить файл. (DISK_FOLDER_22002)."',
        );
        expect(line).toContain('fileName="КП.pdf" fileSizeBytes=48213');
        expect(line).toMatch(/ error=Request failed with status code 400$/);
    });

    it('КП v2: то же самое', async () => {
        const failure = diskSaveFailure();
        const processor = new OfferGenerateMultiProcessor({
            execute: jest.fn().mockRejectedValue(failure),
        } as unknown as OfferWordMultiGenerateUseCase);
        const job = {
            id: 'op-2',
            data: {
                operationId: 'op-2',
                dto: {
                    domain: 'gsirk.bitrix24.ru',
                    dealId: '281275',
                    templateId: '4',
                    variants: [{}, {}],
                },
            },
        } as unknown as Job<OfferGenerateMultiJobPayload>;

        await expect(processor.handle(job)).rejects.toBe(failure);

        const [line] = errorLines(errorSpy);
        expect(line).toContain('Генерация КП v2: провал operationId=op-2');
        expect(line).toContain(
            'step=upload bitrixMethod=disk.folder.uploadfile bitrixStatus=400 bitrixCode=DISK_FOLDER_22002',
        );
        expect(line).toContain('fileSizeBytes=48213');
    });

    it('обычная ошибка: строка как раньше, без лишних полей', async () => {
        const processor = new OfferGenerateProcessor({
            execute: jest.fn().mockRejectedValue(new Error('boom')),
        } as unknown as OfferWordByTemplateGenerateUseCase);
        const job = {
            id: 'op-3',
            data: {
                dto: { domain: 'd.bitrix24.ru', dealId: '1', templateId: '2' },
            },
        } as unknown as Job<OfferGenerateJobPayload>;

        await expect(processor.handle(job)).rejects.toThrow('boom');

        const [line] = errorLines(errorSpy);
        expect(line).toMatch(/durationMs=\d+ error=boom$/);
    });
});
