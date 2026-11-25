import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { TimedCache } from '@lib/shared/lib/utils';
import { PBXService } from '@/modules/pbx';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import {
    AI_ANALYTICS_CACHE_PREFIX,
    AI_ANALYTICS_CACHE_SECTIONS,
} from '../constants/ai-analytics.const';
import { CallsLoader } from '../domain/loaders/calls.loader';
import { portalRangeUtc } from '../domain/loaders/period.util';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { UserNamesReader } from '../domain/loaders/user-names.reader';
import { AiAnalyticsFeedbackStore } from '../store/ai-analytics-feedback.store';
import {
    CALLS_LIST_MEMO_MAX_ENTRIES,
    CALLS_LIST_MEMO_TTL_MS,
    CALLS_LIST_TTL_SECONDS,
} from './calls-list.const';
import { buildCallListRows, groupCallReviews } from './calls-list-index.mapper';
import type { CallListIndex } from './calls-list.types';

/**
 * Версия формы выборки в кэше: меняется вместе с CallListIndex, чтобы
 * после выкладки не читать записи старой формы. v2 — у звонка бейджи и
 * статусы пунктов методики, у выборки — коды пунктов.
 */
const CALL_LIST_KEY_VERSION = 'v2';

/** Ключ выборки периода: `sales-ai-analytics:v1:{domain}:call-list:v2:{from}_{to}`. */
export function buildCallListKey(
    domain: string,
    from: string,
    to: string,
): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${AI_ANALYTICS_CACHE_SECTIONS.CALL_LIST}:${CALL_LIST_KEY_VERSION}:${from}_${to}`;
}

/**
 * Ключ метки выборки — рядом с самой выборкой, в той же секции `call-list`:
 * сброс секции (отзыв руководителя) уносит метку вместе с выборкой.
 */
export function buildCallListStampKey(indexKey: string): string {
    return `${indexKey}:stamp`;
}

/** Запись памяти процесса: разобранная выборка и метка, под которой она прочитана. */
interface CallListMemoEntry {
    stamp: string;
    index: CallListIndex;
}

/**
 * Выборка периода раздела «Разборы звонков»: звонки с разбором (lite-
 * выборка за дни портала), актуальные отзывы руководителей (обратная связь
 * от начала периода до «сейчас» — отзыв на звонок ставят позже звонка) и
 * имена менеджеров. Общая на портал и период, лежит в кэше витрины 5
 * минут — листание и смена фильтров её не перечитывают; сохранение отзыва
 * сбрасывает секцию портала.
 *
 * Память процесса и метка. Выборка за 92 дня крупного портала весит
 * мегабайты: серия кликов по фильтрам иначе каждый раз читала бы их из
 * Redis и разбирала заново. Поэтому разобранная выборка держится в памяти
 * процесса (45 секунд, до 8 периодов). Чтобы память не пережила сброс
 * секции, рядом с выборкой в Redis лежит крошечная метка (случайный id):
 * запрос читает только её и отдаёт выборку из памяти, если метка в памяти
 * та же. Метка пишется при каждой сборке выборки и когда выборка есть, а
 * метки нет. Нет метки (истекла, секция сброшена) — память сбрасывается и
 * выборка читается из Redis заново, в том числе в другом процессе: так
 * «отзыв сохранён — список свежий» работает и между процессами.
 *
 * Инстанс Битрикса — только на время чтения имён (`PBXService.init`), в
 * сервисе не хранится. Имена не прочитались — список без имён, не ошибка.
 */
@Injectable()
export class CallListIndexLoader {
    private readonly logger = new Logger(CallListIndexLoader.name);
    /** Ключ — ключ выборки в Redis; запись общая для читателей, её не меняют. */
    private readonly memo = new TimedCache<CallListMemoEntry>(
        CALLS_LIST_MEMO_TTL_MS,
        Date.now,
        CALLS_LIST_MEMO_MAX_ENTRIES,
    );

    constructor(
        private readonly settings: SettingsLoader,
        private readonly calls: CallsLoader,
        private readonly feedback: AiAnalyticsFeedbackStore,
        private readonly pbx: PBXService,
        private readonly cache: AiAnalyticsCacheService,
    ) {}

    async load(
        domain: string,
        from: string,
        to: string,
        now: Date = new Date(),
    ): Promise<CallListIndex> {
        const key = buildCallListKey(domain, from, to);
        const stampKey = buildCallListStampKey(key);
        const stamp = await this.readStamp(stampKey);
        if (stamp !== null) {
            const memoized = this.memo.peek(key);
            if (memoized?.stamp === stamp) return memoized.index;
        }
        // Метки нет или она другая: выборку пересобрали или сбросили.
        this.memo.delete(key);

        // Только Redis: выборка за 92 дня крупного портала весит мегабайты,
        // а живёт 5 минут — строка в app_cache тут лишняя нагрузка на БД.
        const { value, fromCache } = await this.cache.remember(
            key,
            CALLS_LIST_TTL_SECONDS,
            () => this.build(domain, from, to, now),
            { volatile: true },
        );
        // Пересобранная выборка — новая метка (память других процессов
        // устарела); найденная в Redis при живой метке — её же.
        const actual =
            fromCache && stamp !== null
                ? stamp
                : await this.writeStamp(stampKey);
        this.memo.set(key, { stamp: actual, index: value });
        return value;
    }

    /** Метка выборки в Redis; нет или не прочиталась — null (память не используется). */
    private async readStamp(stampKey: string): Promise<string | null> {
        try {
            const stamp = await this.cache.getJson<string>(stampKey);
            return typeof stamp === 'string' && stamp !== '' ? stamp : null;
        } catch (error) {
            this.logger.warn(
                `Метка выборки ${stampKey} не прочитана: ${(error as Error).message}`,
            );
            return null;
        }
    }

    /**
     * Новая метка в Redis. Не записалась — метка всё равно возвращается: у
     * записи в памяти она будет, а в Redis её нет, и следующий запрос
     * перечитает выборку (память отключается, ответ не страдает).
     */
    private async writeStamp(stampKey: string): Promise<string> {
        const stamp = randomUUID();
        try {
            await this.cache.setVolatileJson(
                stampKey,
                stamp,
                CALLS_LIST_TTL_SECONDS,
            );
        } catch (error) {
            this.logger.warn(
                `Метка выборки ${stampKey} не записана: ${(error as Error).message}`,
            );
        }
        return stamp;
    }

    private async build(
        domain: string,
        from: string,
        to: string,
        now: Date,
    ): Promise<CallListIndex> {
        const { calendar } = await this.settings.load(domain);
        const range = portalRangeUtc(from, to, calendar.timeZone);
        const reviewsUntil = now > range.to ? now : range.to;
        const [lite, feedback] = await Promise.all([
            this.calls.loadLite(domain, range.from, range.to),
            this.feedback.listInPeriod(domain, range.from, reviewsUntil),
        ]);
        const { rows, pointCodes } = buildCallListRows(lite);
        const managerIds = [
            ...new Set(
                rows
                    .map(row => row.managerId)
                    .filter((id): id is string => id !== null),
            ),
        ];
        return {
            rows,
            pointCodes,
            reviews: groupCallReviews(feedback),
            managerNames: await this.managerNames(domain, managerIds),
        };
    }

    private async managerNames(
        domain: string,
        managerIds: readonly string[],
    ): Promise<Record<string, string>> {
        if (managerIds.length === 0) return {};
        try {
            const { bitrix } = await this.pbx.init(domain);
            const names = await new UserNamesReader(bitrix).read(managerIds);
            return Object.fromEntries(names);
        } catch (error) {
            this.logger.warn(
                `Имена менеджеров ${domain} для списка разборов не прочитаны: ${(error as Error).message}`,
            );
            return {};
        }
    }
}
