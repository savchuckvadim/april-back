import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { AiEntityDto, AiService } from '@lib/call-lib';
import {
    AI_ANALYTICS_SNAPSHOT_LOOKBACK_DAYS,
    AI_ANALYTICS_SNAPSHOT_STATUS,
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
    AiAnalyticsSnapshotType,
    SnapshotEnvelope,
    snapshotRetention,
} from '@lib/sales-ai-analytics';
import type {
    AiAnalyticsManagerMonthsOptions,
    AiAnalyticsSnapshotFilter,
    AiAnalyticsSnapshotPruneResult,
    AiAnalyticsSnapshotRecord,
    AiAnalyticsSnapshotUpsertOptions,
    AiAnalyticsSnapshotUpsertResult,
    AiAnalyticsSnapshotWindowOptions,
} from './ai-analytics-snapshot.types';
import {
    fromAisRecord,
    parseSnapshotStatus,
    snapshotManagerId,
    toAisRecord,
} from './snapshot-serialize.util';
import {
    capNewest,
    DAY_MS,
    expiredByCount,
    expiredByDays,
    isPositiveInteger,
    matchesFilter,
    pickLatestPerKey,
    sameSignature,
    withoutNullColumns,
} from './snapshot-store.util';

export * from './ai-analytics-snapshot.types';

/**
 * Хранилище снапшотов AI-аналитики в таблице ais (план 5.1–5.2, Фаза 2
 * §3.2): новых таблиц нет, ключ — domain + type + activity_id (+ менеджер),
 * актуальна последняя запись, прошлые — status 'superseded'. Всё через
 * AiService библиотеки call-lib, прямых обращений к Prisma нет.
 *
 * Выборки. Ключи периодов известны → findByDomainTypeKeys (порции по
 * 500, без окна); неизвестны → окно created_at, и тогда **обязателен
 * limit**: стор берёт не больше limit самых свежих строк (сейчас граница
 * применяется в памяти — у AiService нет `take`, см. handoff call-lib),
 * фильтры менеджера, статуса и latestOnly — поверх них в памяти.
 * Транзакции нет (AiService умеет только create / update(id)); защита от
 * гонки — детерминированный jobId конвейера плюс идемпотентный upsert:
 * повтор с той же сигнатурой inputsHash + paramsVersion + calcVersion
 * копию не создаёт (written: 0), force — принудительный пересчёт. Расход
 * вызова модели (usage конверта) едет в колонки tokens_count / price и в
 * сигнатуру не входит (решение B2 от 21.09.2026).
 *
 * prune не удаляет строки физически (в AiRepository нет delete): он
 * выводит просроченные записи из актуальных тем же статусом и видит
 * только limit свежих строк окна — скорее недочистит, чем лишнее;
 * физическая чистка — админ-джоба Фазы 3 после AiRepository.delete.
 *
 * ⚠ Стор читает только записи в конверте SnapshotEnvelope (manager-week,
 * manager-month, portal-model, forecast, brief, etl-run, style, plan).
 * Типы feedback, audit, settings, settings-audit и rop-mark из того же
 * реестра пишутся своими сторами в собственной форме (без конверта),
 * поэтому здесь они вернут пустой список — читать их надо
 * AiAnalyticsFeedbackStore / AiAnalyticsSettingsStore /
 * AiAnalyticsAuditSnapshotStore / AiAnalyticsSettingsAuditStore /
 * AiAnalyticsRopMarkStore.
 */
@Injectable()
export class AiAnalyticsSnapshotStore {
    constructor(private readonly aiService: AiService) {}

    /**
     * Пишет новую версию снапшота; прошлые актуальные записи того же
     * ключа помечает superseded. Идемпотентен: если актуальная запись
     * ключа уже несёт ту же сигнатуру расчёта, ничего не пишет и отдаёт
     * её id (written: 0); force пишет всегда. Null-колонки опускает —
     * новая строка ais получает NULL.
     */
    async upsert<T>(
        envelope: SnapshotEnvelope<T>,
        options: AiAnalyticsSnapshotUpsertOptions = {},
    ): Promise<AiAnalyticsSnapshotUpsertResult> {
        const previous = await this.findByKeys(envelope.domain, envelope.type, {
            periodKeys: [envelope.periodKey],
            managerIds: [snapshotManagerId(envelope.type, envelope.managerId)],
        });
        const current = previous[previous.length - 1];
        if (
            !options.force &&
            current !== undefined &&
            sameSignature(current, envelope)
        ) {
            return { id: current.id, supersededIds: [], written: 0 };
        }
        const supersededIds: string[] = [];
        for (const record of previous) {
            await this.markSuperseded(record.id);
            supersededIds.push(record.id);
        }
        const { user_result: userResult, ...columns } = toAisRecord(envelope);
        const created = await this.aiService.create({
            ...withoutNullColumns(columns),
            user_result: JSON.parse(
                JSON.stringify(userResult),
            ) as Prisma.JsonValue,
        });
        return { id: created.id, supersededIds, written: 1 };
    }

    /**
     * Снапшоты домена и типа по ключам периодов и менеджерам, по
     * возрастанию возраста. Без periodKeys выборка идёт окном created_at
     * (индекса по ключу нет) и требует limit.
     */
    async findByKeys(
        domain: string,
        type: AiAnalyticsSnapshotType,
        filter: AiAnalyticsSnapshotFilter = {},
    ): Promise<AiAnalyticsSnapshotRecord[]> {
        assertLimit(type, filter);
        const rows = filter.periodKeys?.length
            ? await this.aiService.findByDomainTypeKeys(domain, type, {
                  activityIds: [...filter.periodKeys],
              })
            : await this.findInWindow(domain, type, filter);
        const records = capNewest(rows, filter.limit)
            .flatMap(row => this.toRecord(row))
            .filter(record => matchesFilter(record, filter));
        return filter.latestOnly ? pickLatestPerKey(records) : records;
    }

    /**
     * Последний актуальный снапшот типа: по менеджеру, если он передан
     * (null — портальные записи), иначе по всем. Просматривает limit
     * свежих строк окна (по умолчанию AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT).
     */
    async latest(
        domain: string,
        type: AiAnalyticsSnapshotType,
        managerId?: string | null,
        options: AiAnalyticsSnapshotWindowOptions = {},
    ): Promise<AiAnalyticsSnapshotRecord | null> {
        const records = await this.findByKeys(domain, type, {
            ...options,
            limit: options.limit ?? AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
            ...(managerId === undefined ? {} : { managerIds: [managerId] }),
        });
        return records[records.length - 1] ?? null;
    }

    /**
     * Актуальная модель портала: за месяц monthKey (по ключу, без окна)
     * либо последняя записанная вообще. null — модели ещё нет.
     */
    async latestModel(
        domain: string,
        monthKey?: string,
    ): Promise<AiAnalyticsSnapshotRecord | null> {
        if (monthKey === undefined) {
            return this.latest(
                domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
                null,
            );
        }
        const records = await this.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
            { periodKeys: [monthKey], managerIds: [null], latestOnly: true },
        );
        return records[records.length - 1] ?? null;
    }

    /**
     * Актуальные месяцы менеджеров по ключам месяцев: одна запись на
     * менеджер-месяц (максимальный id), портальных записей нет. Широкая
     * выборка — limit обязателен.
     */
    async findManagerMonths(
        domain: string,
        monthKeys: readonly string[],
        options: AiAnalyticsManagerMonthsOptions,
    ): Promise<AiAnalyticsSnapshotRecord[]> {
        if (monthKeys.length === 0) return [];
        const records = await this.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            {
                periodKeys: monthKeys,
                limit: options.limit,
                latestOnly: true,
                ...(options.managerIds?.length
                    ? { managerIds: options.managerIds }
                    : {}),
            },
        );
        return records.filter(record => record.managerId !== null);
    }

    /**
     * Ретенция типа: оставляет keep последних записей на менеджера
     * (ретенция в записях) либо записи не старше N дней (ретенция в днях);
     * остальные — superseded. Ретенция 'forever' ничего не трогает.
     */
    async prune(
        domain: string,
        type: AiAnalyticsSnapshotType,
        keep?: number,
        options: AiAnalyticsSnapshotWindowOptions = {},
    ): Promise<AiAnalyticsSnapshotPruneResult> {
        const retention = snapshotRetention(type);
        const records = await this.findByKeys(domain, type, {
            ...options,
            limit: options.limit ?? AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
        });
        const keepRecords = keep ?? retention.value ?? 0;
        const expired =
            keep === undefined && retention.unit === 'days'
                ? expiredByDays(records, retention.value, options.now)
                : keep === undefined && retention.unit === 'forever'
                  ? []
                  : expiredByCount(records, keepRecords);
        for (const record of expired) await this.markSuperseded(record.id);
        return {
            retiredIds: expired.map(record => record.id),
            kept: records.length - expired.length,
        };
    }

    /** Помечает запись замещённой (актуальной остаётся последняя). */
    private async markSuperseded(id: string): Promise<void> {
        await this.aiService.update(id, {
            status: AI_ANALYTICS_SNAPSHOT_STATUS.superseded,
        });
    }

    /** Выборка типа окном created_at (когда ключи периодов неизвестны). */
    private async findInWindow(
        domain: string,
        type: AiAnalyticsSnapshotType,
        filter: AiAnalyticsSnapshotFilter,
    ): Promise<AiEntityDto[]> {
        const now = filter.now ?? new Date();
        const lookbackDays =
            filter.lookbackDays ?? AI_ANALYTICS_SNAPSHOT_LOOKBACK_DAYS;
        return this.aiService.findByDomainTypesInPeriod(
            domain,
            [type],
            new Date(now.getTime() - lookbackDays * DAY_MS),
            new Date(now.getTime() + DAY_MS),
        );
    }

    /** Запись ais → снапшот; нераспознанная форма отбрасывается. */
    private toRecord(row: AiEntityDto): AiAnalyticsSnapshotRecord[] {
        const envelope = fromAisRecord(row);
        const status = parseSnapshotStatus(row.status);
        if (!envelope || status === null) return [];
        return [{ id: row.id, createdAt: row.createdAt, status, ...envelope }];
    }
}

/**
 * limit — целое > 0; без periodKeys он обязателен: выборка окном
 * created_at иначе не ограничена (план §3.2).
 */
function assertLimit(
    type: AiAnalyticsSnapshotType,
    filter: AiAnalyticsSnapshotFilter,
): void {
    const missing = filter.limit === undefined;
    if (
        missing
            ? Boolean(filter.periodKeys?.length)
            : isPositiveInteger(filter.limit)
    ) {
        return;
    }
    throw new Error(
        `AiAnalyticsSnapshotStore.findByKeys(${type}): без periodKeys ` +
            'обязателен limit (целое > 0) — верхняя граница строк выборки ' +
            'окном created_at, иначе она не ограничена (план Фазы 2 §3.2)',
    );
}
