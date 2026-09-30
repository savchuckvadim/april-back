import type { AnalyticsCallLiteRow } from '@lib/call-lib';
import {
    buildManagerMonthPayload,
    type ManagerMonthInput,
} from '../../domain/assembler/manager-month.assembler';
import type {
    ManagerMonthPayload,
    ManagerPassportFacts,
} from '../../domain/assembler/manager-snapshot.types';
import type { DatedLiteRow } from '../../domain/loaders/lite-row.mapper';
import { liteRow, portalSettings } from './lite-row.fixture';

/**
 * Настоящие нагрузки месяца менеджера для спек досье: вывод
 * `buildManagerMonthPayload`, а не выдуманный объект. Выдуманные нагрузки
 * с `n` и `score` прятали баг — сборщик месяца этих полей не писал, и ряд
 * «Месяцы» досье показывал 0 разборов (30.09.2026).
 */
export const DOSSIER_MONTH_META = {
    calcVersion: 'sam-1.0.0',
    paramsVersion: 'pv-1',
    comparableFrom: null,
    generatedAt: '2026-09-30T01:00:00.000Z',
    modelSnapshotId: null,
};

/** Паспорт менеджера досье: стаж с апреля 2025, отдел — параметр. */
export function dossierPassport(
    managerId: string,
    departmentId: number | null = null,
): ManagerPassportFacts {
    return {
        managerId,
        since: '2025-04-01',
        sinceSource: 'employment-date',
        status: 'active',
        leftAt: null,
        level: 'middle',
        levelSource: 'manual',
        tenureMonths: 17,
        tenureBand: 'experienced',
        departmentId,
    };
}

/**
 * count разобранных звонков менеджера в месяце monthKey: по звонку в день
 * с 1-го числа (09:00 UTC), презентации по 10 минут с баллом 70.
 */
export function monthCalls(
    managerId: string,
    monthKey: string,
    count: number,
    patch: Partial<AnalyticsCallLiteRow> = {},
): DatedLiteRow[] {
    return Array.from(
        { length: count },
        (_, index) =>
            liteRow({
                transcriptionId: `${managerId}-${monthKey}-${index}`,
                managerId,
                callStartedAt: new Date(
                    `${monthKey}-${String((index % 28) + 1).padStart(2, '0')}T09:00:00Z`,
                ),
                ...patch,
            }) as DatedLiteRow,
    );
}

/** Вход сборщика месяца одного менеджера без KPI и финансов. */
export function dossierMonthInput(
    managerId: string,
    monthKey: string,
    rows: readonly DatedLiteRow[],
    overrides: Partial<ManagerMonthInput> = {},
): ManagerMonthInput {
    const settings = portalSettings();
    return {
        monthKey,
        day: `${monthKey}-28`,
        managerIds: [managerId],
        calendar: settings.calendar,
        timeZone: 'Europe/Moscow',
        rows,
        kpi: undefined,
        finance: undefined,
        settings,
        registry: {},
        passports: new Map([[managerId, dossierPassport(managerId)]]),
        plans: new Map(),
        styles: new Map(),
        chainSharePct: 0,
        comparableFrom: null,
        meta: DOSSIER_MONTH_META,
        ...overrides,
    };
}

/** Настоящая нагрузка месяца менеджера из сборщика месяца. */
export function realMonthPayload(
    managerId: string,
    monthKey: string,
    rows: readonly DatedLiteRow[],
    overrides: Partial<ManagerMonthInput> = {},
): ManagerMonthPayload {
    const assembly = buildManagerMonthPayload(
        dossierMonthInput(managerId, monthKey, rows, overrides),
    );
    const row = assembly.rows.find(item => item.managerId === managerId);
    if (!row) throw new Error(`Сборщик месяца не выдал строку ${managerId}`);

    return row.payload;
}

/**
 * Нагрузка месяца «старого расчёта» (до 30.09.2026): тот же вывод
 * сборщика без полей n, nBeforeComparable и score — так лежат замороженные
 * июль и август.
 */
export function legacyMonthPayload(
    payload: ManagerMonthPayload,
): ManagerMonthPayload {
    const legacy: ManagerMonthPayload = { ...payload };
    delete legacy.n;
    delete legacy.nBeforeComparable;
    delete legacy.score;

    return legacy;
}
