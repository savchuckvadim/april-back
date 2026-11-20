import type { IBXStageHistoryItem } from '@lib/bitrix/domain/crm/stage-history';
import { toDealMovementRow } from '../lib/deal-movement-deal-row';
import { resolveSalesBaseStage } from '../lib/deal-movement-stages';
import { dealMovementStageNorms } from '../lib/deal-movement-stage-norms';
import {
    historyPointsByDeal,
    stageDwellDays,
    toHistoryPoints,
    transitionsByDeal,
} from '../lib/deal-movement-transitions';
import { STAGES, TZ } from './deal-movement.fixture';

const historyItem = (
    id: number,
    ownerId: number,
    stageId: string,
    createdTime: string,
): IBXStageHistoryItem => ({
    ID: id,
    TYPE_ID: 2,
    OWNER_ID: ownerId,
    CREATED_TIME: createdTime,
    CATEGORY_ID: 7,
    STAGE_SEMANTIC_ID: 'P',
    STAGE_ID: stageId,
});

describe('стадии воронки «ОП Основная»', () => {
    it('STAGE_ID с префиксом воронки и без него → ступень лестницы; чужая — null', () => {
        expect(resolveSalesBaseStage('C7:SEND', STAGES)).toEqual({
            code: 'sales_document_send',
            order: 7,
        });
        expect(resolveSalesBaseStage('REFINE', STAGES)).toEqual({
            code: 'sales_refine',
            order: 5,
        });
        expect(resolveSalesBaseStage('C9:UNKNOWN', STAGES)).toBeNull();
        expect(resolveSalesBaseStage(null, STAGES)).toBeNull();
    });
});

describe('строка сделки Битрикса → сделка в объёме правил', () => {
    it('числа, коды и моменты разобраны; даты без пояса — по часам портала', () => {
        const row = toDealMovementRow(
            {
                ID: '9041',
                TITLE: 'ООО «Ромашка»',
                STAGE_ID: 'C7:PRES',
                ASSIGNED_BY_ID: '42',
                OPPORTUNITY: '150000.00',
                MOVED_TIME: '2026-11-10T12:00:00+03:00',
                LAST_ACTIVITY_TIME: '2026-11-16 10:00:00',
                COMPANY_ID: '0',
                CONTACT_ID: '15',
                LEAD_ID: null,
                DATE_CREATE: '2026-10-01T09:00:00+03:00',
            },
            STAGES,
            TZ,
        );

        expect(row).toEqual({
            dealId: 9041,
            title: 'ООО «Ромашка»',
            stageCode: 'sales_pres',
            stageOrder: 4,
            assignedById: 42,
            amount: 150000,
            companyId: null,
            contactId: 15,
            leadId: null,
            movedAt: '2026-11-10T09:00:00.000Z',
            lastActivityAt: '2026-11-16T07:00:00.000Z',
            createdAt: '2026-10-01T06:00:00.000Z',
        });
    });

    it('без id — null; пустое название и сумма — заглушка и null', () => {
        expect(toDealMovementRow({ ID: '' }, STAGES, TZ)).toBeNull();
        expect(
            toDealMovementRow(
                { ID: 5, TITLE: '  ', OPPORTUNITY: '' },
                STAGES,
                TZ,
            ),
        ).toMatchObject({
            title: 'Сделка #5',
            amount: null,
            stageCode: null,
            stageOrder: null,
            movedAt: null,
        });
    });
});

describe('история стадий → переходы', () => {
    it('соседние точки сделки дают переход; чужие стадии и битые записи отброшены', () => {
        const points = toHistoryPoints(
            [
                historyItem(3, 10, 'C7:SEND', '2026-11-05T10:00:00+03:00'),
                historyItem(1, 10, 'C7:COLD', '2026-10-01T10:00:00+03:00'),
                historyItem(5, 10, 'C7:REFINE', '2026-11-12T10:00:00+03:00'),
                historyItem(6, 10, 'C9:OTHER', '2026-11-13T10:00:00+03:00'),
                historyItem(7, 11, 'C7:PRES', 'не дата'),
                historyItem(8, 12, 'C7:PRES', '2026-11-14T10:00:00+03:00'),
                // Повтор записи на стыке страниц.
                historyItem(5, 10, 'C7:REFINE', '2026-11-12T10:00:00+03:00'),
            ],
            STAGES,
        );

        const byDeal = transitionsByDeal(historyPointsByDeal(points));

        expect(byDeal.get(10)).toEqual([
            { at: '2026-11-05T07:00:00.000Z', fromOrder: 2, toOrder: 7 },
            { at: '2026-11-12T07:00:00.000Z', fromOrder: 7, toOrder: 5 },
        ]);
        // Одна точка — переходов нет.
        expect(byDeal.get(12)).toEqual([]);
        expect(byDeal.has(11)).toBe(false);
    });

    it('закрытая стадия остаётся в истории: по ней модель узнаёт переоткрытие', () => {
        const byDeal = transitionsByDeal(
            historyPointsByDeal(
                toHistoryPoints(
                    [
                        historyItem(
                            1,
                            20,
                            'C7:FAIL',
                            '2026-11-01T10:00:00+03:00',
                        ),
                        historyItem(
                            2,
                            20,
                            'C7:COLD',
                            '2026-11-10T10:00:00+03:00',
                        ),
                    ],
                    STAGES,
                ),
            ),
        );

        expect(byDeal.get(20)).toEqual([
            { at: '2026-11-10T07:00:00.000Z', fromOrder: 12, toOrder: 2 },
        ]);
    });
});

describe('срок стадии по истории портала', () => {
    it('закрытые эпизоды стадий: дни до ухода со ступени; повтор ступени — один эпизод, текущая — не считается', () => {
        const dwell = stageDwellDays(
            historyPointsByDeal(
                toHistoryPoints(
                    [
                        historyItem(
                            1,
                            30,
                            'C7:COLD',
                            '2026-10-01T10:00:00+03:00',
                        ),
                        historyItem(
                            2,
                            30,
                            'C7:PRES',
                            '2026-10-11T10:00:00+03:00',
                        ),
                        // Повтор той же стадии (смена воронки и обратно).
                        historyItem(
                            3,
                            30,
                            'C7:PRES',
                            '2026-10-15T10:00:00+03:00',
                        ),
                        historyItem(
                            4,
                            30,
                            'C7:SEND',
                            '2026-10-31T10:00:00+03:00',
                        ),
                    ],
                    STAGES,
                ),
            ),
        );

        expect(dwell.get(2)).toEqual([10]);
        expect(dwell.get(4)).toEqual([20]);
        // «Отправлены» — текущая, эпизод открыт.
        expect(dwell.has(7)).toBe(false);
    });

    it('эпизодов достаточно — p90 вверх до целого дня; мало — срока нет (общий порог)', () => {
        const days = Array.from({ length: 20 }, (_, index) => index + 1);
        const norms = dealMovementStageNorms(
            new Map([
                [4, days],
                [7, days.slice(0, 19)],
                [5, Array.from({ length: 30 }, () => 0.2)],
            ]),
        );

        // p90 ряда 1…20 (тип 7) = 18,1 → 19 дней.
        expect(norms.get(4)).toEqual({ days: 19, episodes: 20 });
        // 19 эпизодов < 20 — нет срока.
        expect(norms.has(7)).toBe(false);
        // Срок не меньше одного дня.
        expect(norms.get(5)?.days).toBe(1);
    });
});
