import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { AiService } from '@lib/call-lib';
import type { AiSettingsChange } from '@lib/sales-ai-analytics/settings/ai-settings.series';
import { AI_ANALYTICS_SETTINGS_AUDIT_RECORD } from '../constants/ai-analytics.const';

/** Что записывает аудит одного сохранения настроек (план §3.1). */
export interface AiSettingsAuditInput {
    domain: string;
    /** День сохранения в TZ портала — ключ записи (activity_id). */
    day: string;
    /** Bitrix-id автора правки. */
    author: string;
    /** Изменения по кодам: было/стало и рвёт ли ряд. */
    changed: readonly AiSettingsChange[];
    /** Граница сравнимой истории до и после сохранения. */
    comparableFromBefore: string;
    comparableFromAfter: string;
    /** Версия параметров после сохранения. */
    paramsVersion: string;
    /** Непустые предупреждения проверки здравого смысла. */
    warnings: readonly string[];
    savedAt: string;
}

/** Форма user_result записи аудита. */
interface AiSettingsAuditPayload extends Omit<AiSettingsAuditInput, 'domain'> {
    kind: 'settings-audit';
}

/** Минимальный порт записи в ais — всё, что нужно аудиту от AiService. */
export type AiSettingsAuditPort = Pick<AiService, 'create'>;

/**
 * Аудит сохранений настроек: каждое `settings/save` (включая подтверждение
 * ростера) пишет отдельный снапшот `ai-analytics-settings-audit` с
 * автором, списком изменений и сдвигом `comparableFrom`. Без него нельзя
 * ответить на вопрос «почему ряд разорван 12-го числа».
 *
 * Обычный провайдер модуля (зарегистрирован интеграционным шагом волны 2):
 * состояния bitrix в нём нет, портал приходит параметром `domain`, поэтому
 * правило про `this.bitrix` не нарушается. Тесты подставляют вместо
 * `AiService` минимальный порт `AiSettingsAuditPort` — из всего сервиса
 * стору нужен только `create`.
 */
@Injectable()
export class AiAnalyticsSettingsAuditStore {
    constructor(private readonly aiService: AiService) {}

    /** Пишет запись аудита; возвращает id ais-записи. */
    async save(input: AiSettingsAuditInput): Promise<string> {
        const { domain, ...rest } = input;
        const payload: AiSettingsAuditPayload = {
            kind: 'settings-audit',
            ...rest,
        };
        const breaking = input.changed.filter(item => item.breaksSeries).length;
        const created = await this.aiService.create({
            provider: AI_ANALYTICS_SETTINGS_AUDIT_RECORD.PROVIDER,
            app: AI_ANALYTICS_SETTINGS_AUDIT_RECORD.APP,
            type: AI_ANALYTICS_SETTINGS_AUDIT_RECORD.TYPE,
            status: 'done',
            activity_id: input.day,
            result:
                `changed: ${input.changed.length}, breaksSeries: ${breaking}, ` +
                `comparableFrom: ${input.comparableFromAfter}`,
            user_result: JSON.parse(
                JSON.stringify(payload),
            ) as Prisma.JsonValue,
            domain,
            ...(Number.isInteger(Number(input.author))
                ? { user_id: Number(input.author) }
                : {}),
        });
        return created.id;
    }
}
