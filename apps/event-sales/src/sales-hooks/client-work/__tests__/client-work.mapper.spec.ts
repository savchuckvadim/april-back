import { classifyClient } from '../../../duplicate-report/lib/duplicate-classify';
import {
    CLASSIFY_OPTIONS,
    DAY,
    makeClientInput,
    makeDeal,
    NAMES,
    NOW,
} from '../../../duplicate-report/__tests__/fixtures/duplicate-report.fixture';
import {
    CLIENT_WORK_HINT,
    joinDealIds,
    joinSelectionError,
    toClientWorkResponse,
} from '../lib/client-work.mapper';

const CLIENT = classifyClient(
    makeClientInput([
        makeDeal(1, { stageOrder: 6, opportunity: 55524 }),
        makeDeal(2, {
            assignedById: 99,
            modifiedAt: NOW - DAY,
            createdAt: NOW - 3 * DAY,
        }),
        makeDeal(3, { createdAt: NOW - 2 * DAY }),
    ]),
    CLASSIFY_OPTIONS,
);

const VIEW = { currentDealId: 2, names: NAMES, canJoin: true };

describe('«Работа клиента»: ответ для блока в «Звонках»', () => {
    it('сделки клиента: основная первой, самая свежая и текущая помечены, имена и «не работает»', () => {
        const response = toClientWorkResponse(CLIENT, VIEW);

        expect(response.client).toEqual({
            kind: 'company',
            id: 100,
            title: 'ООО «Ромашка»',
            inn: '3666000000',
        });
        expect(response.deals.map(deal => deal.id)).toEqual([1, 2, 3]);
        expect(response.suggestedMainDealId).toBe(1);
        expect(response.freshestDealId).toBe(2);
        const second = response.deals[1];
        expect(second).toMatchObject({
            isCurrent: true,
            isFreshest: true,
            isMain: false,
            responsibleName: 'Пётр Уволенный',
            responsibleWorking: false,
        });
        expect(second.modifiedAt).toBe(new Date(NOW - DAY).toISOString());
        expect(response.deals[0].origin).toBe('первая сделка клиента');
        expect(response.canJoin).toBe(true);
        expect(response.hint).toBeNull();
    });

    it('разные ИНН — заметка «сначала проверьте», без кодов', () => {
        const client = classifyClient(
            makeClientInput([
                makeDeal(1, { inn: '3666000001' }),
                makeDeal(2, { inn: '3666000002' }),
            ]),
            CLASSIFY_OPTIONS,
        );

        expect(toClientWorkResponse(client, VIEW).notes).toEqual([
            expect.stringContaining('разные ИНН'),
        ]);
    });

    it('не руководитель — список виден, присоединять нельзя, подсказка', () => {
        const response = toClientWorkResponse(CLIENT, {
            ...VIEW,
            canJoin: false,
        });

        expect(response.deals).toHaveLength(3);
        expect(response.canJoin).toBe(false);
        expect(response.hint).toBe(CLIENT_WORK_HINT.noRights);
    });

    it('одна открытая сделка — присоединять нечего', () => {
        const single = classifyClient(
            makeClientInput([makeDeal(1)]),
            CLASSIFY_OPTIONS,
        );

        const response = toClientWorkResponse(single, VIEW);

        expect(response.canJoin).toBe(false);
        expect(response.howWorked).toBeNull();
        expect(response.hint).toBe(CLIENT_WORK_HINT.single);
    });

    it('у сделки нет клиента — пусто и подсказка', () => {
        expect(toClientWorkResponse(null, VIEW)).toMatchObject({
            client: null,
            deals: [],
            canJoin: false,
            hint: CLIENT_WORK_HINT.noClient,
        });
    });
});

describe('«Работа клиента»: проверка выбора перед присоединением', () => {
    it('верный выбор — без ошибки; повторы и сама основная отбрасываются', () => {
        expect(joinSelectionError(CLIENT, 1, [2, 3])).toBeNull();
        expect(joinDealIds(1, [2, 2, 1, 3])).toEqual([2, 3]);
    });

    it('основная закрыта или чужая — просим обновить список', () => {
        expect(joinSelectionError(CLIENT, 77, [2])).toContain(
            'Основная сделка уже закрыта',
        );
        expect(joinSelectionError(null, 1, [2])).toContain(
            'Основная сделка уже закрыта',
        );
    });

    it('присоединять нечего — просим отметить сделки', () => {
        expect(joinSelectionError(CLIENT, 1, [1])).toBe(
            'Отметьте сделки, которые нужно присоединить к основной.',
        );
    });

    it('сделка уже закрыта или другого клиента — называем её номер', () => {
        expect(joinSelectionError(CLIENT, 1, [2, 500])).toBe(
            'Сделки 500 уже закрыты или не относятся к этому клиенту — ' +
                'обновите список.',
        );
    });
});
