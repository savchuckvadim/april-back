import { IBXStatus } from '@/modules/bitrix';
import { Stage } from '@app/pbx-install/shared';
import { planSingleStageSort } from '../stage-sort-placement';

/**
 * SORT поштучной стадии — по соседям портала, а не по order шаблона
 * (gsr 12.11.2026: «Дубль» с SORT 16 встал раньше «Успеха», Битрикс — 400).
 */
const stage = (code: string, bitrixId: string, order: number): Stage =>
    ({ code, bitrixId, order, name: code, title: code }) as unknown as Stage;

const row = (statusId: string, sort: number, name = statusId): IBXStatus =>
    ({
        ID: statusId,
        STATUS_ID: statusId,
        SORT: sort,
        NAME: name,
    }) as IBXStatus;

const statusIdOf = (bitrixId: string): string => `C97:${bitrixId}`;

const TEMPLATE = [
    stage('sales_new', 'NEW', 1),
    stage('sales_cold', 'COLD', 2),
    stage('sales_success', 'WON', 11),
    stage('sales_fail', 'LOSE', 12),
    stage('sales_double', 'APOLOGY', 13),
    stage('sales_not_ca', 'NOT_CA', 14),
    stage('sales_not_call', 'NOT_CALL', 15),
    stage('sales_duplicate', 'DUPLICATE', 16),
];
const DUPLICATE = TEMPLATE[7];

/** Воронка gsr: шаг 10 и свои стадии портала. */
const GSR_ROWS = [
    row('C97:NEW', 10),
    row('C97:UC_YJOC8K', 20, 'Прозвон'),
    row('C97:UC_8144OL', 30, 'Дозвон'),
    row('C97:COLD', 40),
    row('C97:WON', 130),
    row('C97:LOSE', 140),
    row('C97:APOLOGY', 150),
    row('C97:NOT_CA', 160),
    row('C97:UC_EEKDAI', 170, 'Не трогать'),
];

describe('planSingleStageSort', () => {
    it('gsr: «Дубль» встаёт сразу после «Не ЦА», соседи и свои стадии портала не трогаются', () => {
        const plan = planSingleStageSort({
            stage: DUPLICATE,
            templateStages: TEMPLATE,
            rows: GSR_ROWS,
            statusIdOf,
            reorder: true,
        });

        expect(plan.sort).toBe(161);
        expect(plan.reorderNeighbours).toBe(false);
        expect(plan.reorderSkipped).toContain('Прозвон');
        expect(plan.reorderSkipped).toContain('Не трогать');
    });

    it('стадия посередине — между соседями по их фактическому SORT', () => {
        const plan = planSingleStageSort({
            stage: TEMPLATE[4],
            templateStages: TEMPLATE,
            rows: GSR_ROWS.filter(r => r.STATUS_ID !== 'C97:APOLOGY'),
            statusIdOf,
            reorder: true,
        });

        expect(plan.sort).toBe(150);
    });

    it('соседа сверху нет — сразу перед нижним', () => {
        const plan = planSingleStageSort({
            stage: TEMPLATE[0],
            templateStages: TEMPLATE,
            rows: GSR_ROWS.filter(r => r.STATUS_ID !== 'C97:NEW'),
            statusIdOf,
            reorder: false,
        });

        expect(plan.sort).toBe(39);
        expect(plan.reorderSkipped).toBeNull();
    });

    it('своих стадий у портала нет и пересчёт просили — как раньше: SORT = order, соседи по шаблону', () => {
        const plan = planSingleStageSort({
            stage: DUPLICATE,
            templateStages: TEMPLATE,
            rows: [row('C97:NEW', 1), row('C97:NOT_CA', 14)],
            statusIdOf,
            reorder: true,
        });

        expect(plan).toEqual({
            sort: 16,
            reorderNeighbours: true,
            reorderSkipped: null,
        });
    });

    it('соседей на портале нет вовсе — order шаблона', () => {
        const plan = planSingleStageSort({
            stage: DUPLICATE,
            templateStages: TEMPLATE,
            rows: [row('C97:UC_X', 5, 'Своя')],
            statusIdOf,
            reorder: true,
        });

        expect(plan.sort).toBe(16);
        expect(plan.reorderNeighbours).toBe(false);
    });

    it('сама синхронизируемая стадия на портале своей не считается', () => {
        const plan = planSingleStageSort({
            stage: DUPLICATE,
            templateStages: TEMPLATE,
            rows: [row('C97:NOT_CA', 14), row('C97:DUPLICATE', 900)],
            statusIdOf,
            reorder: true,
        });

        expect(plan.reorderNeighbours).toBe(true);
        expect(plan.sort).toBe(16);
    });
});
