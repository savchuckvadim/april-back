import { ForbiddenException } from '@nestjs/common';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import {
    disagreementSharePct,
    FeedbackUseCase,
} from '../domain/use-cases/feedback.use-case';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

const created = new Date('2026-09-03T10:00:00Z');

function makeUseCase(records: object[] = []) {
    const store = {
        add: jest.fn().mockResolvedValue('9001'),
        listInPeriod: jest.fn().mockResolvedValue(records),
    };
    // Реальный сервис доступа ради assertVisible; структура и кэш не нужны.
    const access = new RequesterAccessService(
        {} as never,
        {} as never,
        {} as never,
    );
    return {
        useCase: new FeedbackUseCase(
            store as never,
            access,
            settingsLoaderWith(),
        ),
        store,
    };
}

const leader = { role: 'op' as const, visibleManagerIds: ['10', '20', '447'] };
const manager = { role: 'manager' as const, visibleManagerIds: ['512'] };

describe('FeedbackUseCase', () => {
    it('add: менеджер пишет только за себя (managerId подменяется), requesterUserId сохраняется', async () => {
        const { useCase, store } = makeUseCase();
        await useCase.add(
            {
                domain: 'd',
                requesterUserId: '512',
                kind: 'disagree',
                object: 'call:1',
                managerId: '10',
                reason: 'нет',
            },
            manager,
        );
        expect(store.add).toHaveBeenCalledWith(
            expect.objectContaining({
                managerId: '512',
                requesterUserId: '512',
                transcriptionId: null,
                reason: 'нет',
            }),
        );
    });

    it('add: руководитель — за менеджера периметра, за чужого → 403', async () => {
        const { useCase, store } = makeUseCase();
        const result = await useCase.add(
            {
                domain: 'd',
                requesterUserId: '447',
                kind: 'useful',
                object: 'agenda',
                managerId: '20',
            },
            leader,
        );
        expect(result).toEqual({ id: '9001' });
        expect(store.add).toHaveBeenCalledWith(
            expect.objectContaining({ managerId: '20', reason: null }),
        );
        await expect(
            useCase.add(
                {
                    domain: 'd',
                    requesterUserId: '447',
                    kind: 'useful',
                    object: 'agenda',
                    managerId: '99',
                },
                leader,
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('list: даты периода в TZ портала, доля несогласий по реакциям', async () => {
        const { useCase, store } = makeUseCase([
            {
                id: '1',
                createdAt: created,
                kind: 'useful',
                object: 'agenda',
                managerId: '10',
                transcriptionId: null,
                requesterUserId: '447',
                reason: null,
            },
            {
                id: '2',
                createdAt: created,
                kind: 'disagree',
                object: 'call:5',
                managerId: '20',
                transcriptionId: '5',
                requesterUserId: '20',
                reason: 'x',
            },
            {
                id: '3',
                createdAt: created,
                kind: 'view',
                object: 'pulse',
                managerId: null,
                transcriptionId: null,
                requesterUserId: '447',
                reason: null,
            },
            {
                id: '4',
                createdAt: created,
                kind: 'not_useful',
                object: 'pulse',
                managerId: null,
                transcriptionId: null,
                requesterUserId: '447',
                reason: null,
            },
        ]);
        const data = await useCase.list(
            {
                domain: 'd',
                requesterUserId: '447',
                from: '2026-09-01',
                to: '2026-09-30',
            },
            leader,
        );
        expect(store.listInPeriod).toHaveBeenCalledWith(
            'd',
            new Date('2026-08-31T21:00:00.000Z'),
            new Date('2026-09-30T20:59:59.999Z'),
            undefined,
        );
        expect(data.items).toHaveLength(4);
        expect(data.items[1]).toEqual({
            id: '2',
            kind: 'disagree',
            object: 'call:5',
            managerId: '20',
            transcriptionId: '5',
            requesterUserId: '20',
            reason: 'x',
            createdAt: '2026-09-03T10:00:00.000Z',
        });
        expect(data.disagreementSharePct).toBeCloseTo(33.3, 1);
    });

    it('list: менеджер получает только свои строки (managerId = requester)', async () => {
        const { useCase, store } = makeUseCase([]);
        await useCase.list(
            {
                domain: 'd',
                requesterUserId: '512',
                from: '2026-09-01',
                to: '2026-09-30',
                managerId: '10',
            },
            manager,
        );
        expect(store.listInPeriod).toHaveBeenCalledWith(
            'd',
            expect.any(Date),
            expect.any(Date),
            '512',
        );
    });

    it('disagreementSharePct: null без реакций, view не считается', () => {
        expect(disagreementSharePct([])).toBeNull();
        expect(disagreementSharePct(['view', 'alert_sent'])).toBeNull();
        expect(disagreementSharePct(['useful', 'disagree'])).toBe(50);
        expect(disagreementSharePct(['useful', 'useful', 'disagree'])).toBe(
            33.3,
        );
    });
});
