import { Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';

/** Куда положили файл и что показывать получателю. */
export interface WeeklyReportUpload {
    fileId: number | null;
    fileUrl: string | null;
}

/**
 * Доставка недельного отчёта на портал: файл на Диск + уведомления
 * получателям. Одна ответственность — транспорт (сборка данных и
 * оформление книги живут в соседних сервисах).
 *
 * НЕ Injectable-инстанс с this.bitrix: экземпляр Битрикса приходит
 * параметром на каждый вызов (правило домена — никакого хранения
 * инстанса в поле сервиса).
 */
@Injectable()
export class CallReportWeeklyDeliveryService {
    private readonly logger = new Logger(CallReportWeeklyDeliveryService.name);

    /**
     * Кладёт xlsx на Диск: в указанную папку (папка рабочей группы
     * «Продажи» и т.п.) либо, если папка не задана/недоступна, в
     * хранилище приложения. Fail-open: ошибка загрузки не должна ронять
     * недельный крон.
     */
    async upload(
        bitrix: BitrixService,
        fileName: string,
        content: Buffer,
        folderId: number | null,
    ): Promise<WeeklyReportUpload> {
        const base64 = content.toString('base64');
        try {
            if (folderId) {
                const response = await bitrix.disk.folder.uploadfile({
                    id: folderId,
                    data: { NAME: fileName },
                    fileContent: [fileName, base64],
                    generateUniqueName: true,
                });
                return this.readUploadResult(response);
            }
            const storageId = await this.resolveAppStorageId(bitrix);
            if (!storageId) return { fileId: null, fileUrl: null };
            const response = await bitrix.disk.storage.uploadfile({
                id: storageId,
                data: { NAME: fileName },
                fileContent: [fileName, base64],
                generateUniqueName: true,
            });
            return this.readUploadResult(response);
        } catch (error) {
            this.logger.error(
                `Файл отчёта не загружен на Диск (${fileName}): ` +
                    (error as Error).message,
                { telegram: true },
            );
            return { fileId: null, fileUrl: null };
        }
    }

    /**
     * Персональные уведомления получателям (список задан в настройках
     * портала). Возвращает тех, кому уведомление ушло: сбой по одному
     * получателю не мешает остальным.
     */
    async notify(
        bitrix: BitrixService,
        userIds: number[],
        message: string,
    ): Promise<number[]> {
        const delivered: number[] = [];
        for (const userId of userIds) {
            try {
                await bitrix.imNotify.systemAdd({
                    USER_ID: userId,
                    MESSAGE: message,
                    TAG: 'call-report-weekly',
                });
                delivered.push(userId);
            } catch (error) {
                this.logger.warn(
                    `Уведомление о недельном отчёте не доставлено ` +
                        `пользователю ${userId}: ${(error as Error).message}`,
                );
            }
        }
        return delivered;
    }

    /** id файла и ссылка из ответа disk.*.uploadfile. */
    private readUploadResult(response: unknown): WeeklyReportUpload {
        const result = (
            response as {
                result?: {
                    ID?: number | string;
                    DOWNLOAD_URL?: string;
                    DETAIL_URL?: string;
                };
            } | null
        )?.result;
        const fileId = Number(result?.ID);
        return {
            fileId: Number.isFinite(fileId) && fileId > 0 ? fileId : null,
            fileUrl: result?.DETAIL_URL ?? result?.DOWNLOAD_URL ?? null,
        };
    }

    /** Хранилище приложения на Диске — запасной адрес для файла. */
    private async resolveAppStorageId(
        bitrix: BitrixService,
    ): Promise<number | null> {
        try {
            const response = (await bitrix.disk.storage.getlist({})) as {
                result?: { ID?: number | string; ENTITY_TYPE?: string }[];
            };
            const storages = response?.result ?? [];
            const preferred =
                storages.find(item => item.ENTITY_TYPE === 'common') ??
                storages[0];
            const id = Number(preferred?.ID);
            return Number.isFinite(id) && id > 0 ? id : null;
        } catch (error) {
            this.logger.warn(
                `Хранилища Диска не прочитаны: ${(error as Error).message}`,
            );
            return null;
        }
    }
}
