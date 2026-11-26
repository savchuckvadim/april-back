import { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { BadRequestException } from '@nestjs/common';
import { noteBitrixCallMethod } from '@lib/bitrix/core/base/bitrix-error-method.util';
import {
    describeOfferFailure,
    inOfferStep,
    noteOfferFailureFile,
    noteOfferFailureStep,
    OFFER_FAILURE_COMMENT_MAX,
    OFFER_GENERATION_STEP,
    offerFailureNotesOf,
} from '../lib/offer-generation-failure.util';

/**
 * Случай с прода (gsirk, сделка 281275, 26.11.2026): Диск Битрикса не сохранил
 * файл, и менеджер получил «Ошибка при создании документа». Теперь в сделке
 * причина, в журнале шаг, метод Битрикса и размер файла.
 */

/** Ошибка вызова Битрикса так, как её бросает BitrixCore: axios + метка метода. */
const bitrixError = (
    method: string,
    status: number | null,
    body?: unknown,
): AxiosError => {
    const config = {
        url: `https://gsirk.bitrix24.ru/rest/1/SECRETKEY/${method}`,
    } as InternalAxiosRequestConfig;
    const error =
        status === null
            ? new AxiosError('timeout of 30000ms exceeded', 'ECONNABORTED')
            : new AxiosError(
                  `Request failed with status code ${status}`,
                  'ERR_BAD_REQUEST',
                  config,
                  undefined,
                  {
                      status,
                      statusText: '',
                      headers: {},
                      config,
                      data: body,
                  },
              );
    noteBitrixCallMethod(error, method);
    return error;
};

const diskSaveError = () =>
    bitrixError('disk.folder.uploadfile', 400, {
        error: 'DISK_FOLDER_22002',
        error_description: 'Не удалось сохранить файл. (DISK_FOLDER_22002).',
    });

const failedAt = (error: unknown, step: Parameters<typeof inOfferStep>[0]) => {
    noteOfferFailureStep(error, step);
    return describeOfferFailure(error);
};

describe('describeOfferFailure — комментарий в сделке', () => {
    it('отказ Диска: шаг, текст Битрикса с кодом и совет повторить', () => {
        const { comment, step } = failedAt(
            diskSaveError(),
            OFFER_GENERATION_STEP.upload,
        );

        expect(step).toBe('upload');
        expect(comment).toBe(
            'КП не сформировано: загрузка на Диск — Битрикс ответил «Не удалось сохранить файл» (DISK_FOLDER_22002). Повторите формирование.',
        );
    });

    it('отказ в правах: код и описание Битрикса, без совета повторить', () => {
        const { comment } = failedAt(
            bitrixError('crm.timeline.comment.add', 403, {
                error: 'ACCESS_DENIED',
                error_description: 'Access denied',
            }),
            OFFER_GENERATION_STEP.timeline,
        );

        expect(comment).toBe(
            'КП не сформировано: запись в таймлайн сделки — Битрикс ответил «Access denied» (ACCESS_DENIED).',
        );
    });

    it('только код без описания и только описание без кода', () => {
        expect(
            failedAt(
                bitrixError('crm.deal.get', 400, { error: 'ERROR_CORE' }),
                OFFER_GENERATION_STEP.build,
            ).comment,
        ).toBe(
            'КП не сформировано: сборка документа — Битрикс ответил ошибкой ERROR_CORE.',
        );
        expect(
            failedAt(
                bitrixError('crm.deal.get', 400, {
                    error_description: 'Сделка не найдена',
                }),
                OFFER_GENERATION_STEP.build,
            ).comment,
        ).toBe(
            'КП не сформировано: сборка документа — Битрикс ответил «Сделка не найдена».',
        );
    });

    it('Битрикс отдал 5xx без тела (страница прокси) — временная недоступность', () => {
        const { comment } = failedAt(
            bitrixError(
                'disk.folder.uploadfile',
                502,
                '<html>Bad Gateway</html>',
            ),
            OFFER_GENERATION_STEP.upload,
        );

        expect(comment).toBe(
            'КП не сформировано: загрузка на Диск — Битрикс временно недоступен (HTTP 502). Повторите формирование.',
        );
    });

    it('другой 4xx без тела — статус', () => {
        expect(
            failedAt(
                bitrixError('disk.folder.uploadfile', 413, ''),
                OFFER_GENERATION_STEP.upload,
            ).comment,
        ).toBe(
            'КП не сформировано: загрузка на Диск — Битрикс ответил HTTP 413.',
        );
    });

    describe('ошибка axios без ответа', () => {
        it('таймаут', () => {
            expect(
                failedAt(
                    bitrixError('disk.folder.uploadfile', null),
                    OFFER_GENERATION_STEP.upload,
                ).comment,
            ).toBe(
                'КП не сформировано: загрузка на Диск — Битрикс не ответил вовремя. Повторите формирование.',
            );
        });

        it('обрыв соединения', () => {
            const error = new AxiosError('socket hang up', 'ECONNRESET');
            noteBitrixCallMethod(error, 'disk.folder.uploadfile');

            expect(failedAt(error, OFFER_GENERATION_STEP.upload).comment).toBe(
                'КП не сформировано: загрузка на Диск — оборвалась связь с Битриксом. Повторите формирование.',
            );
        });

        it('нет сети', () => {
            const error = new AxiosError(
                'getaddrinfo ENOTFOUND gsirk.bitrix24.ru',
                'ENOTFOUND',
            );
            noteBitrixCallMethod(error, 'crm.deal.get');

            expect(failedAt(error, OFFER_GENERATION_STEP.build).comment).toBe(
                'КП не сформировано: сборка документа — нет связи с Битриксом. Повторите формирование.',
            );
        });
    });

    describe('прочие ошибки — внутренняя ошибка без подробностей', () => {
        it('обычная ошибка: текст и пути в комментарий не попадают', () => {
            const { comment } = failedAt(
                new Error(
                    "ENOENT: no such file or directory, open '/srv/result/gsirk/offer.docx'",
                ),
                OFFER_GENERATION_STEP.build,
            );

            expect(comment).toBe(
                'КП не сформировано: сборка документа — внутренняя ошибка, подробности в журнале.',
            );
        });

        it('шаг не определён — без шага', () => {
            expect(describeOfferFailure(new Error('x')).comment).toBe(
                'КП не сформировано: внутренняя ошибка, подробности в журнале.',
            );
            expect(describeOfferFailure(undefined).comment).toBe(
                'КП не сформировано: внутренняя ошибка, подробности в журнале.',
            );
        });

        it('ошибка axios из другого сервиса (без метки Битрикса) — тоже внутренняя', () => {
            const error = new AxiosError(
                'Request failed with status code 500',
                'ERR_BAD_RESPONSE',
                undefined,
                undefined,
                {
                    status: 500,
                    statusText: '',
                    headers: {},
                    config: {} as InternalAxiosRequestConfig,
                    data: { error: 'libreoffice crashed' },
                },
            );

            expect(failedAt(error, OFFER_GENERATION_STEP.build).comment).toBe(
                'КП не сформировано: сборка документа — внутренняя ошибка, подробности в журнале.',
            );
        });

        it('после записи в сделку: КП уже у менеджера, формулировка другая', () => {
            expect(
                failedAt(new Error('db down'), OFFER_GENERATION_STEP.finish)
                    .comment,
            ).toBe(
                'КП сформировано и лежит в сделке, но завершающий шаг не выполнился: внутренняя ошибка, подробности в журнале.',
            );
        });
    });

    describe('короткая и безопасная строка', () => {
        it('длинное описание Битрикса обрезается, комментарий не длиннее предела', () => {
            const { comment } = failedAt(
                bitrixError('disk.folder.uploadfile', 400, {
                    error: 'X'.repeat(500),
                    error_description: 'Очень длинное описание. '.repeat(100),
                }),
                OFFER_GENERATION_STEP.upload,
            );

            expect(comment.length).toBeLessThanOrEqual(
                OFFER_FAILURE_COMMENT_MAX,
            );
            expect(comment).toContain('Очень длинное описание');
            expect(comment).toContain('…');
        });

        it('теги и переносы из ответа Битрикса вычищаются', () => {
            const { comment } = failedAt(
                bitrixError('crm.deal.get', 400, {
                    error: 'ERROR_CORE',
                    error_description:
                        '<b>Плохой</b>\n\n   запрос\r\nв  сделке',
                }),
                OFFER_GENERATION_STEP.build,
            );

            expect(comment).toContain('«Плохой запрос в сделке»');
            expect(comment).not.toMatch(/[<>\n\r]/);
        });

        it('адрес вебхука с ключом и стек не попадают ни в комментарий, ни в журнал', () => {
            const error = diskSaveError();
            error.stack = 'Error: boom\n    at secret (/srv/app/secret.js:1:1)';
            noteOfferFailureFile(error, { name: 'КП.pdf', sizeBytes: 10 });

            const { comment, logFields } = failedAt(
                error,
                OFFER_GENERATION_STEP.upload,
            );

            for (const text of [comment, logFields]) {
                expect(text).not.toContain('SECRETKEY');
                expect(text).not.toContain('secret.js');
            }
        });
    });
});

describe('describeOfferFailure — поля строки журнала', () => {
    it('отказ Диска: шаг, метод, статус, код и описание Битрикса, файл и размер', () => {
        const error = diskSaveError();
        noteOfferFailureFile(error, {
            name: 'КП Иванов.pdf',
            sizeBytes: 48213,
        });

        const { logFields } = failedAt(error, OFFER_GENERATION_STEP.upload);

        expect(logFields).toBe(
            'step=upload bitrixMethod=disk.folder.uploadfile bitrixStatus=400 ' +
                'bitrixCode=DISK_FOLDER_22002 ' +
                'bitrixDescription="Не удалось сохранить файл. (DISK_FOLDER_22002)." ' +
                'fileName="КП Иванов.pdf" fileSizeBytes=48213',
        );
    });

    it('обычная ошибка: только шаг', () => {
        expect(
            failedAt(new Error('x'), OFFER_GENERATION_STEP.build).logFields,
        ).toBe('step=build');
    });

    it('шага и подробностей нет — пусто', () => {
        expect(describeOfferFailure(new Error('x')).logFields).toBe('');
        expect(describeOfferFailure('строка').logFields).toBe('');
    });

    it('таймаут Битрикса: метод есть, статуса и кода нет', () => {
        expect(
            failedAt(
                bitrixError('disk.folder.uploadfile', null),
                OFFER_GENERATION_STEP.upload,
            ).logFields,
        ).toBe('step=upload bitrixMethod=disk.folder.uploadfile');
    });
});

describe('inOfferStep — шаг по месту падения', () => {
    it('ошибка летит дальше той же, с меткой шага', async () => {
        const original = new BadRequestException('шаблон не найден');

        const thrown = await inOfferStep(OFFER_GENERATION_STEP.build, () =>
            Promise.reject(original),
        ).catch((error: unknown) => error);

        expect(thrown).toBe(original);
        expect(thrown).toBeInstanceOf(BadRequestException);
        expect(offerFailureNotesOf(thrown).step).toBe('build');
    });

    it('успех возвращает результат шага', async () => {
        await expect(
            inOfferStep(OFFER_GENERATION_STEP.upload, () =>
                Promise.resolve(42),
            ),
        ).resolves.toBe(42);
    });

    it('самый ранний шаг сохраняется: внешняя обёртка его не перетирает', async () => {
        const thrown = await inOfferStep(OFFER_GENERATION_STEP.finish, () =>
            inOfferStep(OFFER_GENERATION_STEP.upload, () =>
                Promise.reject(new Error('x')),
            ),
        ).catch((error: unknown) => error);

        expect(offerFailureNotesOf(thrown).step).toBe('upload');
    });

    it('брошенная строка становится Error, чтобы нести метку', async () => {
        const thrown = await inOfferStep(OFFER_GENERATION_STEP.timeline, () =>
            Promise.reject('просто строка'),
        ).catch((error: unknown) => error);

        expect(thrown).toBeInstanceOf(Error);
        expect((thrown as Error).message).toBe('просто строка');
        expect(offerFailureNotesOf(thrown).step).toBe('timeline');
    });
});
