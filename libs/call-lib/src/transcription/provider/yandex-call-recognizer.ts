import type { Logger } from '@nestjs/common';
import type { YandexStorageService } from '@lib/call-lib/yandex/yandex-storage.service';
import {
    channelsRequiredByYandex,
    isYandexOperationAlive,
    isYandexOperationNotFound,
    YandexOperationFailedError,
    type StreamingTranscriptionService,
    type YandexChannelCount,
    type YandexTranscriptionDetailed,
} from '../services/streaming-transcription.service';
import type {
    YandexCallRef,
    YandexSubmissionGuard,
} from './yandex-submission-guard.service';
import type { YandexSlot } from './yandex-slot';

/** Запись звонка в Object Storage: ключ объекта и адрес для Яндекса. */
export interface YandexUploadedAudio {
    objectKey: string;
    uri: string;
}

/** Звонок для Яндекс-пути: кто он для стража и как положить запись в Object Storage. */
export interface YandexCallInput {
    call: YandexCallRef;
    /** Каналов по заголовку MP3; null — не определено (спецификация на 1). */
    channels: YandexChannelCount | null;
    /** Загрузить запись — только когда отправка действительно нужна. */
    upload(): Promise<YandexUploadedAudio>;
}

export interface YandexCallRecognizerDeps {
    storage: Pick<YandexStorageService, 'deleteFile'>;
    yandex: Pick<
        StreamingTranscriptionService,
        'transcribeAudio' | 'getTranscriptionDetailed'
    >;
    guard: Pick<
        YandexSubmissionGuard,
        'withCallLock' | 'storedOperation' | 'forgetOperation' | 'submit'
    >;
    logger: Pick<Logger, 'log' | 'warn'>;
    /** Слот Яндекса в процессе; нет — без ограничителя (старый путь). */
    slot?: Pick<YandexSlot, 'run'>;
}

/**
 * Yandex-путь: замок звонка → слот → сохранённая операция или запись в
 * Object Storage → отправка через стража → опрос → удаление записи.
 *
 * - Замок берётся ДО ожидания слота: второй запуск того же звонка сразу
 *   получает отказ, а не встаёт в очередь (19.11.2026).
 * - Номер операции, сохранённый стражем, продолжает опрос: таймаут опроса
 *   или ретрай задания больше не оплачивают звонок второй раз. Яндекс
 *   операцию не знает (истекла) или она завершилась ошибкой — отправка
 *   заново, в пределах лимита стража.
 * - Число каналов — по заголовку MP3: телефония части порталов отдаёт
 *   стерео, а Яндекс отвергает несовпадение со спецификацией («Audio has
 *   2 channels, but 1 requested», gsr 29.10.2026). Заголовок обманул —
 *   один повтор с числом из ответа Яндекса; повтор тоже идёт через стража.
 * - Запись удаляется из Object Storage, когда Яндекс дал окончательный
 *   ответ; пока операция может идти (таймаут опроса, сбои), запись цела.
 *
 * Не Injectable: зависимости аргументами, держит роутер или старый сервис.
 */
export class YandexCallRecognizer {
    constructor(private readonly deps: YandexCallRecognizerDeps) {}

    recognize(input: YandexCallInput): Promise<YandexTranscriptionDetailed> {
        const { slot } = this.deps;
        const locked = (): Promise<YandexTranscriptionDetailed> =>
            this.recognizeLocked(input);
        return this.deps.guard.withCallLock(input.call, () =>
            slot ? slot.run(locked, input.call.label) : locked(),
        );
    }

    private async recognizeLocked(
        input: YandexCallInput,
    ): Promise<YandexTranscriptionDetailed> {
        const resumed = await this.resume(input.call);
        if (resumed) return resumed;

        const audio = await input.upload();
        const channels = input.channels ?? 1;
        return this.settle(audio.objectKey, async () => {
            try {
                return await this.run(input.call, audio, channels);
            } catch (error) {
                const actual = channelsRequiredByYandex(error);
                if (actual === null || actual === channels) throw error;
                this.deps.logger.warn(
                    `Яндекс насчитал в ${input.call.label} каналов: ${actual}, по заголовку MP3 — ${channels}; повтор с ${actual}`,
                    { domain: input.call.domain },
                );
                return this.run(input.call, audio, actual);
            }
        });
    }

    /** Продолжить сохранённую операцию; null — её нет, нужна отправка. */
    private async resume(
        call: YandexCallRef,
    ): Promise<YandexTranscriptionDetailed | null> {
        const stored = await this.deps.guard.storedOperation(call);
        if (!stored) return null;
        this.deps.logger.log(
            `Продолжаю ждать операцию ${stored.operationId} для ${call.label} — повторно в Яндекс не отправляю`,
        );
        try {
            return await this.settle(stored.objectKey, () =>
                this.poll(call, stored.operationId),
            );
        } catch (error) {
            if (isYandexOperationNotFound(error)) {
                await this.deps.guard.forgetOperation(call);
            } else if (!(error instanceof YandexOperationFailedError)) {
                throw error;
            }
            this.deps.logger.warn(
                `Операция ${stored.operationId} (${call.label}) не дала результата: ${(error as Error).message} — отправка заново`,
                { domain: call.domain },
            );
            return null;
        }
    }

    private async run(
        call: YandexCallRef,
        audio: YandexUploadedAudio,
        channels: YandexChannelCount,
    ): Promise<YandexTranscriptionDetailed> {
        const operationId = await this.deps.guard.submit(
            call,
            { channels, objectKey: audio.objectKey },
            () => this.deps.yandex.transcribeAudio(audio.uri, channels),
        );
        return this.poll(call, operationId);
    }

    /** Опрос; операция завершилась ошибкой Яндекса — номер больше не нужен. */
    private async poll(
        call: YandexCallRef,
        operationId: string,
    ): Promise<YandexTranscriptionDetailed> {
        try {
            return await this.deps.yandex.getTranscriptionDetailed(operationId);
        } catch (error) {
            if (error instanceof YandexOperationFailedError) {
                await this.deps.guard.forgetOperation(call);
            }
            throw error;
        }
    }

    /** Окончательный ответ Яндекса (успех или ошибка) — запись больше не нужна. */
    private async settle<T>(
        objectKey: string | null,
        work: () => Promise<T>,
    ): Promise<T> {
        try {
            const result = await work();
            await this.removeAudio(objectKey);
            return result;
        } catch (error) {
            if (!isYandexOperationAlive(error)) {
                await this.removeAudio(objectKey);
            }
            throw error;
        }
    }

    private async removeAudio(objectKey: string | null): Promise<void> {
        if (!objectKey) return;
        try {
            await this.deps.storage.deleteFile(objectKey);
        } catch (error) {
            this.deps.logger.warn(
                `Запись ${objectKey} не удалена из Object Storage: ${(error as Error).message}`,
            );
        }
    }
}
