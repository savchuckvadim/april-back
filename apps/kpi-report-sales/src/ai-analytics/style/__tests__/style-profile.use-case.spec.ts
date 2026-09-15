import { ForbiddenException } from '@nestjs/common';
import { RequesterAccessService } from '../../domain/access/requester-access.service';
import { AiAnalyticsStyleController } from '../ai-analytics-style.controller';
import { StyleProfileUseCase } from '../style-profile.use-case';
import { StyleSettingsLoader } from '../style-settings.loader';

const leader = { role: 'op' as const, visibleManagerIds: ['10', '512'] };
const manager = { role: 'manager' as const, visibleManagerIds: ['512'] };
const NOW = new Date('2026-09-14T10:00:00Z');

/** Снапшот профиля: 60 разборов, 11 коллег, две подписи, одна оспорена. */
const snapshot = (payload: Record<string, unknown> = {}) => ({
    id: 's1',
    domain: 'd',
    type: 'ai-analytics-style',
    periodKey: '2026-08',
    managerId: '512',
    generatedAt: '2026-09-01T03:00:00.000Z',
    payload: {
        calls: 60,
        peers: 11,
        window: ['2026-06', '2026-07', '2026-08'],
        confidence: 'ok',
        confidenceReason: null,
        vector: { persistence: 0.42, tempo: -0.1 },
        funnelShape: 'closer',
        tags: [
            {
                code: 'persistent',
                title: 'чаще коллег возвращается после переноса',
                basis: '62 % против 41 % (n = 26 лидов)',
                n: 26,
            },
            {
                code: 'fast',
                title: 'больше коротких контактов',
                basis: '22 звонка в день против 15',
                n: 58,
            },
        ],
        axes: [
            {
                code: 'persistence',
                n: 26,
                dTilde: 0.42,
                ci80: [0.18, 0.66],
                confidence: { level: 'ok' },
            },
            {
                code: 'objection_response',
                n: 3,
                dTilde: 0,
                ci80: [0, 0],
                confidence: { level: 'none', reason: 'few-calls' },
            },
        ],
        ...payload,
    },
});

interface Harness {
    useCase: StyleProfileUseCase;
    latest: jest.Mock;
    findByKeys: jest.Mock;
}

function harness(record: object | null, optOut = ''): Harness {
    const latest = jest.fn().mockResolvedValue(record);
    const findByKeys = jest.fn().mockResolvedValue(record ? [record] : []);
    const snapshots = { latest, findByKeys };
    const settings = new StyleSettingsLoader({
        resolve: () => Promise.resolve({ aiAnalyticsStyleOptOut: optOut }),
    } as never);
    const access = new RequesterAccessService(
        {} as never,
        {} as never,
        {} as never,
    );
    return {
        useCase: new StyleProfileUseCase(snapshots as never, settings, access),
        latest,
        findByKeys,
    };
}

describe('StyleProfileUseCase', () => {
    it('карточка профиля: подписи с опорой, оси с интервалами, «Как считаем»', async () => {
        const { useCase, latest } = harness(snapshot());

        const card = await useCase.execute(
            { domain: 'd', requesterUserId: '447', managerId: '512' },
            leader,
            NOW,
        );

        expect(latest).toHaveBeenCalled();
        expect(card.status).toBe('ready');
        expect(card.monthKey).toBe('2026-08');
        expect(card.profile?.calls).toBe(60);
        expect(card.profile?.tags.map(tag => tag.code)).toEqual([
            'persistent',
            'fast',
        ]);
        expect(card.notable).toHaveLength(2);
        expect(card.funnelShape).toBe('closer');
        expect(card.howWeCount.length).toBeGreaterThan(0);
        const axis = card.axes.find(item => item.code === 'persistence');
        expect(axis).toMatchObject({
            title: 'Повторные касания',
            minus: 'редкие касания',
            plus: 'много касаний',
            value: 0.42,
            ci80: [0.18, 0.66],
            confidence: 'ok',
        });
    });

    it('ось без маркеров приходит с доверием none и причиной, а не исчезает', async () => {
        const { useCase } = harness(snapshot());

        const card = await useCase.execute(
            { domain: 'd', requesterUserId: '447', managerId: '512' },
            leader,
            NOW,
        );

        expect(
            card.axes.find(item => item.code === 'objection_response'),
        ).toMatchObject({ confidence: 'none', reason: 'few-calls' });
    });

    it('оспоренная подпись остаётся в карточке, но не идёт в notable', async () => {
        const { useCase } = harness(snapshot({ disputedTags: ['persistent'] }));

        const card = await useCase.execute(
            { domain: 'd', requesterUserId: '512', managerId: '512' },
            manager,
            NOW,
        );

        expect(card.profile?.tags[0]).toMatchObject({
            code: 'persistent',
            disputed: true,
        });
        expect(card.notable).toEqual(['больше коротких контактов']);
    });

    it('opt-out: профиля нет ни менеджеру, ни руководителю, снапшот не читается', async () => {
        const { useCase, latest } = harness(snapshot(), '512, 7');

        const card = await useCase.execute(
            { domain: 'd', requesterUserId: '447', managerId: '512' },
            leader,
            NOW,
        );

        expect(card.status).toBe('opt_out');
        expect(card.profile).toBeNull();
        expect(card.axes).toEqual([]);
        expect(card.note).toBe('профиль отключён по запросу сотрудника');
        expect(latest).not.toHaveBeenCalled();
    });

    it('разборов меньше порога — few_data с текстом, а не пустая карточка', async () => {
        // Порог применяет шаг портальным значением style_min_calls и
        // отдаёт confidence none с причиной few-calls — карточка верит
        // снапшоту, а не своей копии дефолта.
        const { useCase } = harness(
            snapshot({
                calls: 12,
                confidence: 'none',
                confidenceReason: 'few-calls',
            }),
        );

        const card = await useCase.execute(
            { domain: 'd', requesterUserId: '447', managerId: '512' },
            leader,
            NOW,
        );

        expect(card.status).toBe('few_data');
        expect(card.profile).toBeNull();
        expect(card.note).toBe('данных для стиля пока мало');
    });

    it('портал понизил style_min_calls — профиль снапшота показывается', async () => {
        // 32 разбора ниже дефолта библиотеки (40), но шаг посчитал
        // профиль по портальному порогу и отдал доверие ok.
        const { useCase } = harness(snapshot({ calls: 32 }));

        const card = await useCase.execute(
            { domain: 'd', requesterUserId: '447', managerId: '512' },
            leader,
            NOW,
        );

        expect(card.status).toBe('ready');
        expect(card.profile?.calls).toBe(32);
    });

    it('мало коллег — карточка с оговоркой «отдел мал», а не без неё', async () => {
        const { useCase } = harness(
            snapshot({
                peers: 6,
                confidence: 'low',
                confidenceReason: 'few-peers',
            }),
        );

        const card = await useCase.execute(
            { domain: 'd', requesterUserId: '447', managerId: '512' },
            leader,
            NOW,
        );

        expect(card.status).toBe('ready');
        expect(card.note).toBe('отдел мал — подписи только как ориентир');
    });

    it('снапшота нет — few_data, месяц запроса сохраняется', async () => {
        const { useCase, findByKeys } = harness(null);

        const card = await useCase.execute(
            {
                domain: 'd',
                requesterUserId: '447',
                managerId: '512',
                monthKey: '2026-07',
            },
            leader,
            NOW,
        );

        expect(findByKeys).toHaveBeenCalled();
        expect(card.status).toBe('few_data');
        expect(card.monthKey).toBe('2026-07');
    });

    it('старый снапшот помечается stale', async () => {
        const { useCase } = harness(snapshot());

        const card = await useCase.execute(
            { domain: 'd', requesterUserId: '447', managerId: '512' },
            leader,
            new Date('2026-12-01T10:00:00Z'),
        );

        expect(card.stale).toBe(true);
        expect(card.note).toBe('профиль давно не пересчитывался');
    });

    it('чужой менеджер — 403', async () => {
        const { useCase } = harness(snapshot());

        await expect(
            useCase.execute(
                { domain: 'd', requesterUserId: '512', managerId: '10' },
                manager,
                NOW,
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('AiAnalyticsStyleController', () => {
    it('периметр читателя резолвится до расчёта карточки', async () => {
        const resolveViewer = jest.fn().mockResolvedValue(leader);
        const execute = jest.fn().mockResolvedValue({ status: 'ready' });
        const controller = new AiAnalyticsStyleController(
            { resolveViewer } as never,
            { execute } as never,
        );

        const dto = { domain: 'd', requesterUserId: '447', managerId: '512' };
        await controller.getStyleProfile(dto);

        expect(resolveViewer).toHaveBeenCalledWith('d', '447');
        expect(execute).toHaveBeenCalledWith(dto, leader);
    });

    it('403 из resolveViewer (self_view выключён) наверх не глотается', async () => {
        const controller = new AiAnalyticsStyleController(
            {
                resolveViewer: jest
                    .fn()
                    .mockRejectedValue(new ForbiddenException()),
            } as never,
            { execute: jest.fn() } as never,
        );

        await expect(
            controller.getStyleProfile({
                domain: 'd',
                requesterUserId: '512',
                managerId: '512',
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
