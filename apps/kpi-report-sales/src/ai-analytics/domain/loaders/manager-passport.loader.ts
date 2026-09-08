/**
 * Паспорт менеджера (план Фазы 2, поток 14a; план 4.6 «since без ручного
 * ввода»): дата начала работы, статус, стаж, полоса стажа и уровень.
 * Руками не вводится ничего — каскад источников идёт сам:
 *
 *   UF_EMPLOYMENT_DATE → DATE_REGISTER → первое событие (прокси),
 *
 * и источник остаётся в паспорте (`sinceSource`), чтобы витрина не выдавала
 * прокси-дату за дату трудоустройства. Ушедший сотрудник определяется по
 * `ACTIVE = N`, дата ухода — по последнему событию.
 *
 * ⚠ Деградация обязательна (§5.4): поля `UF_EMPLOYMENT_DATE` на портале
 * может не быть, и `user.get` может отказать целиком — каскад обязан дойти
 * до запасного варианта, а не упасть. Пустой паспорт (`since: null`) —
 * штатный результат: норма тогда берётся слоем портала.
 *
 * `@Injectable` без bitrix-состояния: инстанс берётся на вызов
 * (`PBXService.init(domain)`), в поля класса не кладётся. Чистый разбор и
 * сборка паспорта — в `manager-passport.util.ts` (лимит 300 строк).
 */
import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { toPortalDate } from '@lib/sales-ai-analytics';
import type { ManagerPassport } from '@lib/sales-ai-analytics';
import { parseTenureGates } from '@lib/sales-ai-analytics/model/tenure-bands';
import type { ParamContext } from '@lib/sales-ai-analytics/params/index';
import { resolveParam } from '@lib/sales-ai-analytics/params/index';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import {
    AI_PASSPORT_TTL_SECONDS,
    AI_PASSPORT_USER_CHUNK,
    AI_PASSPORT_USER_FIELDS,
    AI_PASSPORT_USER_ID_FILTER,
    buildPassportKey,
} from '../../constants/ai-passport.const';
import { buildReportUsersKey } from '../../../report';
import { ManagersLoader } from './managers.loader';
import {
    buildPassport,
    toUserFacts,
    type ManagerUserFacts,
} from './manager-passport.util';
import { AiAnalyticsPortalSettings, SettingsLoader } from './settings.loader';

export type {
    BuildPassportInput,
    ManagerUserFacts,
} from './manager-passport.util';

export interface ManagerPassportLoadOptions {
    /** Уже загруженные настройки портала (контекст прогона конвейера). */
    settings?: AiAnalyticsPortalSettings;
    /** Слои реестра — для границ полос стажа (`tenure_gates`). */
    registry?: ParamContext;
    /** Дата расчёта стажа 'YYYY-MM-DD'; по умолчанию — сегодня в TZ. */
    until?: string;
    /** Момент расчёта (время параметром, не `new Date()` внутри). */
    now?: Date;
    /** Прокси-источник: менеджер → дата первого события 'YYYY-MM-DD'. */
    firstEventAt?: Readonly<Record<string, string>>;
    /** Перечитать портал, игнорируя кэш. */
    forceRefresh?: boolean;
}

/** Паспорта и число вызовов Bitrix (для журнала прогона). */
export interface ManagerPassportResult {
    passports: ManagerPassport[];
    bitrixCalls: number;
    /** Bitrix не ответил — паспорта собраны по прокси и настройкам. */
    ok: boolean;
}

/** Факты пользователей портала и цена их получения. */
interface UserFactsResult {
    facts: ManagerUserFacts[];
    bitrixCalls: number;
    ok: boolean;
}

@Injectable()
export class ManagerPassportLoader {
    private readonly logger = new Logger(ManagerPassportLoader.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly settings: SettingsLoader,
        private readonly cache: AiAnalyticsCacheService,
        private readonly managers: ManagersLoader,
    ) {}

    /** Паспорта ростера: факты портала → каскад → статус, стаж, уровень. */
    async load(
        domain: string,
        managerIds?: readonly (string | number)[],
        options: ManagerPassportLoadOptions = {},
    ): Promise<ManagerPassportResult> {
        const ids = await this.managers.resolve(domain, managerIds);
        const settings = options.settings ?? (await this.settings.load(domain));
        const now = options.now ?? new Date();
        const until =
            options.until ?? toPortalDate(now, settings.calendar.timeZone);
        const gates = parseTenureGates(
            resolveParam('tenure_gates', options.registry ?? {}).value,
        );
        const { facts, bitrixCalls, ok } = await this.userFacts(
            domain,
            ids,
            options.forceRefresh ?? false,
        );
        const byId = new Map(facts.map(row => [row.managerId, row]));
        const levels = new Map(
            settings.levels.map(level => [String(level.managerId), level]),
        );

        return {
            ok,
            bitrixCalls,
            passports: ids.map(id => {
                const managerId = String(id);
                const row = byId.get(managerId);
                const level = levels.get(managerId);
                return buildPassport({
                    managerId,
                    ...(row ? { facts: row } : {}),
                    firstEventAt: options.firstEventAt?.[managerId] ?? null,
                    ...(level ? { level } : {}),
                    absences: settings.absences[managerId] ?? [],
                    until,
                    gates,
                });
            }),
        };
    }

    /** Факты пользователей: кэш на час, отказ портала — пустой список. */
    private async userFacts(
        domain: string,
        ids: readonly number[],
        forceRefresh: boolean,
    ): Promise<UserFactsResult> {
        if (!ids.length) return { facts: [], bitrixCalls: 0, ok: true };
        const key = buildPassportKey(domain, buildReportUsersKey([...ids]));
        const cached = forceRefresh
            ? null
            : await this.cache.getJson<ManagerUserFacts[]>(key);
        if (cached) return { facts: cached, bitrixCalls: 0, ok: true };

        try {
            const facts = await this.fetchUsers(domain, ids);
            await this.cache.setJson(key, facts, AI_PASSPORT_TTL_SECONDS);
            return { facts, bitrixCalls: chunkCount(ids.length), ok: true };
        } catch (error) {
            this.logger.warn(
                `Паспорта менеджеров (${domain}) не прочитаны, каскад уйдёт ` +
                    `на прокси: ${(error as Error).message}`,
            );
            return { facts: [], bitrixCalls: 0, ok: false };
        }
    }

    /** `user.get` порциями по 50 (метод отдаёт страницами). */
    private async fetchUsers(
        domain: string,
        ids: readonly number[],
    ): Promise<ManagerUserFacts[]> {
        const { bitrix } = await this.pbx.init(domain);
        const facts: ManagerUserFacts[] = [];
        for (let at = 0; at < ids.length; at += AI_PASSPORT_USER_CHUNK) {
            const chunk = ids.slice(at, at + AI_PASSPORT_USER_CHUNK);
            const { result } = await bitrix.user.get(
                {
                    [AI_PASSPORT_USER_ID_FILTER]: chunk.map(String),
                } as Partial<IBXUser>,
                [...AI_PASSPORT_USER_FIELDS],
            );
            const rows = (result ?? []) as unknown as Record<string, unknown>[];
            facts.push(...rows.flatMap(toUserFacts));
        }

        return facts;
    }
}

/** Сколько порций `user.get` уходит на ростер (он же — вызовов Bitrix). */
function chunkCount(total: number): number {
    return Math.ceil(total / AI_PASSPORT_USER_CHUNK);
}
