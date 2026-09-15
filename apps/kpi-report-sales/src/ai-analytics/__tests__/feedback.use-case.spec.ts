import { ForbiddenException } from '@nestjs/common';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import {
    disagreementSharePct,
    FeedbackUseCase,
} from '../domain/use-cases/feedback.use-case';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

const created = new Date('2026-09-03T10:00:00Z');

function makeUseCase(
    records: object[] = [],
    styleSnapshot: object | null = null,
) {
    const store = {
        add: jest.fn().mockResolvedValue('9001'),
        listInPeriod: jest.fn().mockResolvedValue(records),
    };
    const snapshots = {
        latest: jest.fn().mockResolvedValue(styleSnapshot),
        upsert: jest.fn().mockResolvedValue({
            id: '1',
            supersededIds: [],
            written: 1,
        }),
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
            snapshots as never,
        ),
        store,
        snapshots,
    };
}

/** Матчер вложенного объекта: без него nested objectContaining даёт any. */
const objectWith = (fields: Record<string, unknown>): unknown =>
    expect.objectContaining(fields) as unknown;

/** Снапшот стиля с двумя подписями — материал для «оспорена». */
const styleSnapshotOf = (disputedTags?: string[]) => ({
    domain: 'd',
    type: 'ai-analytics-style',
    periodKey: '2026-08',
    managerId: '512',
    calcVersion: 'v1',
    paramsVersion: 'p1',
    inputsHash: 'h1',
    generatedAt: '2026-09-01T03:00:00.000Z',
    payload: {
        calls: 60,
        tags: [{ code: 'persistent' }, { code: 'fast' }],
        ...(disputedTags ? { disputedTags } : {}),
    },
});

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

describe('FeedbackUseCase: несогласие субъекта с подписью стиля', () => {
    const styleDisagree = (object: string) => ({
        domain: 'd',
        requesterUserId: '512',
        kind: 'disagree' as const,
        object,
        managerId: '512',
    });

    it('ставит disputed на названную подпись в снапшоте стиля', async () => {
        const { useCase, snapshots } = makeUseCase([], styleSnapshotOf());

        await useCase.add(styleDisagree('style:tag:persistent'), manager);

        expect(snapshots.upsert).toHaveBeenCalledTimes(1);
        expect(snapshots.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                periodKey: '2026-08',
                payload: objectWith({ disputedTags: ['persistent'] }),
            }),
            { force: true },
        );
    });

    it('несогласие с профилем целиком оспаривает все подписи', async () => {
        const { useCase, snapshots } = makeUseCase([], styleSnapshotOf());

        await useCase.add(styleDisagree('style'), manager);

        expect(snapshots.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: objectWith({ disputedTags: ['fast', 'persistent'] }),
            }),
            { force: true },
        );
    });

    it('подпись уже оспорена — снапшот не переписывается', async () => {
        const { useCase, snapshots } = makeUseCase(
            [],
            styleSnapshotOf(['persistent']),
        );

        await useCase.add(styleDisagree('style:tag:persistent'), manager);

        expect(snapshots.upsert).not.toHaveBeenCalled();
    });

    it('несогласие руководителя подпись не снимает', async () => {
        const { useCase, snapshots } = makeUseCase([], styleSnapshotOf());

        await useCase.add(
            {
                domain: 'd',
                requesterUserId: '447',
                kind: 'disagree',
                object: 'style:tag:persistent',
                managerId: '10',
            },
            leader,
        );

        expect(snapshots.upsert).not.toHaveBeenCalled();
    });

    it('чужой объект и другие реакции снапшот не трогают', async () => {
        const { useCase, snapshots } = makeUseCase([], styleSnapshotOf());

        await useCase.add(styleDisagree('call:1'), manager);
        await useCase.add(
            { ...styleDisagree('style'), kind: 'useful' },
            manager,
        );

        expect(snapshots.latest).not.toHaveBeenCalled();
        expect(snapshots.upsert).not.toHaveBeenCalled();
    });

    it('роль автора пишется в запись обратной связи', async () => {
        const { useCase, store } = makeUseCase([], styleSnapshotOf());

        await useCase.add(styleDisagree('style:tag:fast'), manager);

        expect(store.add).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: objectWith({ authorRole: 'subject' }),
            }),
        );
    });
});
