import { Injectable, Logger, Optional } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    AI_ANALYTICS_THRESHOLDS,
    MIN_DURATION_DEFAULT_TYPE,
    type MinDurationSecByType,
    type OwnerReportCrmFacts,
    type OwnerReportPeriod,
    type OwnerReportPeriodBounds,
    type OwnerReportTelephonyFacts,
} from '@lib/sales-ai-analytics';
import { AiManagerScopeResolver } from '../domain/access/ai-manager-scope.resolver';
import { AiAnalyticsCalendarLoader } from '../domain/loaders/calendar.loader';
import { CallsLoader } from '../domain/loaders/calls.loader';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';
import { portalMinDurationByType } from '../domain/loaders/min-duration.util';
import { portalRangeUtc } from '../domain/loaders/period.util';
import { PulseTelephonyLoader } from '../domain/loaders/pulse-telephony.loader';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { UserNamesReader } from '../domain/loaders/user-names.reader';
import { OwnerReportCrmLoader } from './owner-report-crm.loader';
import {
    OwnerReportReactivationLoader,
    type OwnerReportDatedRow,
} from './owner-report-reactivation.loader';

/** Всё, что нужно модели отчёта за период и за прошлый период. */
export interface OwnerReportSources {
    period: OwnerReportPeriod;
    previousPeriod: OwnerReportPeriod;
    /** Периметр отдела: ростер ОП ∩ список разбора (Bitrix ID строками). */
    managerIds: string[];
    /** Строки звонков с признаком «реактивация» (fail-open — без него). */
    rows: OwnerReportDatedRow[];
    previousRows: OwnerReportDatedRow[];
    minDurationByType: MinDurationSecByType;
    telephony: OwnerReportTelephonyFacts | null;
    /** CRM-факты периода (продажи, счета, показы, план); null — источники не ответили. */
    crm: OwnerReportCrmFacts | null;
    names: Record<string, string>;
}

/**
 * Источники отчёта собственнику: настройки портала (TZ, календарь, порог
 * длительности), периметр отдела, lite-строки звонков за период и за
 * прошлый период, итоги телефонии, CRM-факты, имена сотрудников.
 * Телефония, CRM и имена — fail-open: без них отчёт выходит, только без
 * этих строк.
 *
 * `@Injectable` без bitrix-состояния: инстанс Битрикса берётся внутри
 * метода через `PBXService.init(domain)` и дальше не хранится.
 */
@Injectable()
export class OwnerReportSourcesLoader {
    private readonly logger = new Logger(OwnerReportSourcesLoader.name);

    constructor(
        private readonly settings: SettingsLoader,
        private readonly scopes: AiManagerScopeResolver,
        private readonly calls: CallsLoader,
        private readonly telephony: PulseTelephonyLoader,
        private readonly crm: OwnerReportCrmLoader,
        private readonly pbx: PBXService,
        private readonly reactivation: OwnerReportReactivationLoader,
        /** Календарь портала с переносами РФ; нет (спеки) — из настроек. */
        @Optional() private readonly calendars?: AiAnalyticsCalendarLoader,
    ) {}

    async load(
        domain: string,
        bounds: OwnerReportPeriodBounds,
        previous: OwnerReportPeriodBounds,
        now: Date = new Date(),
    ): Promise<OwnerReportSources> {
        const settings = await this.settings.load(domain);
        const calendar = this.calendars
            ? (await this.calendars.load(domain, { now })).calendar
            : settings.calendar;
        const toPeriod = (
            range: OwnerReportPeriodBounds,
        ): OwnerReportPeriod => ({
            kind: range.kind,
            from: range.from,
            to: range.to,
            timeZone: calendar.timeZone,
            calendar,
        });
        const scope = await this.scopes.resolveFor(
            domain,
            undefined,
            settings.callReport,
        );
        const managerIds = scope.managerIds.map(String);
        const minDurationByType = portalMinDurationByType(settings);
        const [rows, previousRows, telephony, crm, names] = await Promise.all([
            this.loadRows(domain, bounds, calendar.timeZone),
            this.loadRows(domain, previous, calendar.timeZone),
            this.loadTelephony(
                domain,
                bounds,
                calendar.timeZone,
                minDurationByType,
                settings.callReport,
            ),
            this.crm.load(domain, bounds, managerIds, now),
            this.loadNames(domain, managerIds),
        ]);
        // Реактивация — по сделкам компании; оба периода, чтобы группы
        // «холодные / возврат» сравнивались одинаково.
        const [markedRows, markedPrevious] = await Promise.all([
            this.reactivation.mark(domain, rows, calendar.timeZone),
            this.reactivation.mark(domain, previousRows, calendar.timeZone),
        ]);
        return {
            period: toPeriod(bounds),
            previousPeriod: toPeriod(previous),
            managerIds,
            rows: markedRows,
            previousRows: markedPrevious,
            minDurationByType,
            telephony,
            crm,
            names,
        };
    }

    private loadRows(
        domain: string,
        bounds: OwnerReportPeriodBounds,
        timeZone: string,
    ): Promise<DatedLiteRow[]> {
        const { from, to } = portalRangeUtc(bounds.from, bounds.to, timeZone);
        return this.calls.loadLite(domain, from, to);
    }

    private async loadTelephony(
        domain: string,
        bounds: OwnerReportPeriodBounds,
        timeZone: string,
        minDurationByType: MinDurationSecByType,
        callReport: OwnerReportSourcesCallReport,
    ): Promise<OwnerReportTelephonyFacts | null> {
        const share = await this.telephony.shortShare(domain, {
            from: bounds.from,
            to: bounds.to,
            timeZone,
            minDurationSec:
                minDurationByType[MIN_DURATION_DEFAULT_TYPE] ??
                AI_ANALYTICS_THRESHOLDS.shortCallSec,
            ...(callReport ? { callReport } : {}),
        });
        return share
            ? { outbound: null, connected: share.connected, short: share.short }
            : null;
    }

    /** Имена по Bitrix ID; сбой Битрикса — пустая карта, карточки по id. */
    private async loadNames(
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
                `Имена сотрудников ${domain} не прочитаны: ${(error as Error).message}`,
            );
            return {};
        }
    }
}

type OwnerReportSourcesCallReport = Parameters<
    PulseTelephonyLoader['shortShare']
>[1]['callReport'];
