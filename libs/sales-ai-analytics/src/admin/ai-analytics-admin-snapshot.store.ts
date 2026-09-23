/**
 * Read-only стор снапшотов AI-аналитики для админ-ручек (план Фазы 3,
 * П5). Образец — `ai-analytics-audit-snapshot.store.ts`: только чтение
 * через `AiService` библиотеки call-lib, прямых обращений к Prisma нет.
 *
 * Зачем свой стор, а не `AiAnalyticsSnapshotStore` приложения: тот живёт
 * в `apps/kpi-report-sales`, а библиотека приложение импортировать не
 * может (луковая архитектура). Здесь только чтение — писать и замещать
 * записи по-прежнему может лишь конвейер приложения.
 *
 * Читаются записи в конверте `SnapshotEnvelope` (manager-week,
 * manager-month, portal-model, forecast, brief, etl-run, style, plan,
 * trends). Записи вне конверта (feedback, audit, settings, rop-mark)
 * сюда не попадают — их читает `readRaw`.
 */
import { Injectable } from '@nestjs/common';
import { AiEntityDto, AiService } from '@lib/call-lib';
import {
    AI_ANALYTICS_SNAPSHOT_LOOKBACK_DAYS,
    AiAnalyticsSnapshotStatus,
    AiAnalyticsSnapshotType,
    isAiAnalyticsSnapshotStatus,
} from '../contracts/snapshot-kinds.const';
import { parseSnapshotUserResult } from '../contracts/snapshot.parse';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Снапшот, прочитанный админ-стором: конверт плюс колонки расхода. */
export interface AiAnalyticsAdminSnapshotRecord<T = unknown> {
    id: string;
    type: AiAnalyticsSnapshotType;
    domain: string;
    /** Ключ периода (колонка activity_id). */
    periodKey: string;
    /** Менеджер (колонка user_id); null — портальное зерно. */
    managerId: string | null;
    /** calcVersion (колонка model). */
    calcVersion: string;
    paramsVersion: string;
    inputsHash: string;
    /** Момент формирования, ISO (UTC). */
    generatedAt: string;
    status: AiAnalyticsSnapshotStatus;
    createdAt: Date;
    /** Токенов вызова модели (колонка tokens_count); 0 — модель не звали. */
    tokensCount: number;
    /** Стоимость вызова, ₽ (колонка price); 0 — цена не задана. */
    price: number;
    payload: T;
}

/** Сырая ais-запись (типы вне конверта: feedback и прочие). */
export interface AiAnalyticsAdminRawRecord {
    id: string;
    type: string;
    domain: string;
    periodKey: string;
    managerId: string | null;
    status: string;
    createdAt: Date;
    tokensCount: number;
    price: number;
    userResult: unknown;
}

/** Окно чтения по created_at и верхняя граница числа записей. */
export interface AiAnalyticsAdminReadWindow {
    /** Нижняя граница created_at; нет — LOOKBACK_DAYS назад от `to`. */
    from?: Date;
    /** Верхняя граница created_at; нет — сутки вперёд от «сейчас». */
    to?: Date;
    /** Не больше стольких самых свежих записей; нет — все из окна. */
    limit?: number;
}

@Injectable()
export class AiAnalyticsAdminSnapshotStore {
    constructor(private readonly aiService: AiService) {}

    /**
     * Снапшоты домена заданных типов за окно, свежие первыми. Записи
     * чужой формы (не конверт) пропускаются молча — админ-ручка не
     * должна падать из-за одной посторонней строки ais.
     */
    async read<T = unknown>(
        domain: string,
        types: readonly AiAnalyticsSnapshotType[],
        window: AiAnalyticsAdminReadWindow = {},
        now: Date = new Date(),
    ): Promise<AiAnalyticsAdminSnapshotRecord<T>[]> {
        const records = await this.load(domain, types, window, now);
        const parsed = records.flatMap(record =>
            this.toSnapshot<T>(record, types),
        );
        return applyLimit(parsed, window.limit);
    }

    /**
     * Сырые записи домена заданных типов за окно, свежие первыми: для
     * типов вне конверта (обратная связь, аудит, настройки).
     */
    async readRaw(
        domain: string,
        types: readonly string[],
        window: AiAnalyticsAdminReadWindow = {},
        now: Date = new Date(),
    ): Promise<AiAnalyticsAdminRawRecord[]> {
        const records = await this.load(domain, types, window, now);
        const parsed = records
            .map(record => toRaw(record))
            .sort(byCreatedAtDesc);
        return applyLimit(parsed, window.limit);
    }

    private async load(
        domain: string,
        types: readonly string[],
        window: AiAnalyticsAdminReadWindow,
        now: Date,
    ): Promise<AiEntityDto[]> {
        if (types.length === 0) return [];
        const to = window.to ?? new Date(now.getTime() + DAY_MS);
        const from =
            window.from ??
            new Date(
                to.getTime() - AI_ANALYTICS_SNAPSHOT_LOOKBACK_DAYS * DAY_MS,
            );
        return this.aiService.findByDomainTypesInPeriod(
            domain,
            [...types],
            from,
            to,
        );
    }

    private toSnapshot<T>(
        record: AiEntityDto,
        types: readonly AiAnalyticsSnapshotType[],
    ): AiAnalyticsAdminSnapshotRecord<T>[] {
        const type = types.find(known => known === record.type);
        if (!type) return [];
        const envelope = parseSnapshotUserResult(record.user_result);
        if (!envelope) return [];
        return [
            {
                id: record.id,
                type,
                domain: record.domain,
                periodKey: record.activity_id,
                managerId: envelope.managerId,
                calcVersion: record.model,
                paramsVersion: envelope.paramsVersion,
                inputsHash: envelope.inputsHash,
                generatedAt: envelope.generatedAt,
                status: isAiAnalyticsSnapshotStatus(record.status)
                    ? record.status
                    : 'done',
                createdAt: record.createdAt,
                tokensCount: record.tokens_count,
                price: record.price,
                payload: envelope.payload as T,
            },
        ];
    }
}

function toRaw(record: AiEntityDto): AiAnalyticsAdminRawRecord {
    return {
        id: record.id,
        type: record.type,
        domain: record.domain,
        periodKey: record.activity_id,
        managerId: record.user_id ? String(record.user_id) : null,
        status: record.status,
        createdAt: record.createdAt,
        tokensCount: record.tokens_count,
        price: record.price,
        userResult: record.user_result,
    };
}

function byCreatedAtDesc(
    a: { createdAt: Date },
    b: { createdAt: Date },
): number {
    return b.createdAt.getTime() - a.createdAt.getTime();
}

function applyLimit<T extends { createdAt: Date }>(
    records: T[],
    limit?: number,
): T[] {
    const sorted = [...records].sort(byCreatedAtDesc);
    return limit !== undefined && limit > 0 ? sorted.slice(0, limit) : sorted;
}
