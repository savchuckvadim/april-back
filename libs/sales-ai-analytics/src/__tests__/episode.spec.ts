import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    type PbxDealSalesBaseStageCode,
    getSalesBaseStageOrder,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';

import {
    AI_EPISODE_FAIL_STAGE_CODES,
    AI_EPISODE_SUCCESS_STAGE_CODE,
    type StageTransition,
    buildEpisodes,
    daysBetween,
    episodeAt,
    episodeKeyOf,
    groupEpisodesByEntity,
} from '../model/episode';

/** Момент расчёта: время только параметром, `new Date()` в модели запрещён. */
const NOW = '2026-06-30T09:00:00+03:00';

const STAGE = PBX_DEAL_SALES_BASE_STAGE_CODE;

/** ISO-момент июньского дня в TZ портала. */
const day = (number: number): string =>
    `2026-06-${String(number).padStart(2, '0')}T09:00:00+03:00`;

/** Семантика стадии выводится из лестницы, литералов стадий в тесте нет. */
function semanticOf(code: PbxDealSalesBaseStageCode): 'P' | 'S' | 'F' {
    if (code === AI_EPISODE_SUCCESS_STAGE_CODE) {
        return 'S';
    }

    return AI_EPISODE_FAIL_STAGE_CODES.some(failCode => failCode === code)
        ? 'F'
        : 'P';
}

function transition(
    entityId: string,
    code: PbxDealSalesBaseStageCode,
    dayNumber: number,
): StageTransition {
    return {
        entityId,
        stageCode: code,
        order: getSalesBaseStageOrder(code),
        semantic: semanticOf(code),
        at: day(dayNumber),
    };
}

describe('buildEpisodes: эпизоды сделки и три вида концов', () => {
    const transitions: StageTransition[] = [
        // Продажа: новая → презентация → успех.
        transition('D1', STAGE.new, 1),
        transition('D1', STAGE.presentation, 3),
        transition('D1', STAGE.success, 10),
        // Отказ по коду лестницы.
        transition('D2', STAGE.new, 1),
        transition('D2', STAGE.cold, 2),
        transition('D2', STAGE.fail, 5),
        // Сделка ещё открыта — цензура.
        transition('D3', STAGE.new, 1),
        transition('D3', STAGE.warm, 4),
    ];

    const episodes = buildEpisodes(transitions, { now: NOW });

    it('последовательность переходов даёт эпизоды с концами advance | fail | censored', () => {
        expect(episodes.map(episode => episode.end)).toEqual([
            'advance',
            'advance',
            'advance',
            'fail',
            'advance',
            'censored',
        ]);
    });

    it('продвижение — переход на стадию с большим порядком', () => {
        const advance = episodes.find(episode => episode.key === 'D1#0');
        expect(advance).toMatchObject({
            stageCode: STAGE.new,
            toStageCode: STAGE.presentation,
            end: 'advance',
            endReason: 'advance',
            durationDays: 2,
            success: false,
        });
        expect(advance?.toOrder).toBeGreaterThan(advance?.order ?? 0);
    });

    it('продажа закрывает эпизод продвижением с флагом success', () => {
        expect(episodes.find(episode => episode.key === 'D1#1')).toMatchObject({
            toStageCode: AI_EPISODE_SUCCESS_STAGE_CODE,
            end: 'advance',
            success: true,
            durationDays: 7,
        });
    });

    it('коды отказа лестницы дают fail, хотя их порядок выше продажи', () => {
        const failure = episodes.find(episode => episode.key === 'D2#1');
        expect(failure).toMatchObject({
            toStageCode: STAGE.fail,
            end: 'fail',
            endReason: 'fail-stage',
            success: false,
        });
        expect(getSalesBaseStageOrder(STAGE.fail)).toBeGreaterThan(
            getSalesBaseStageOrder(AI_EPISODE_SUCCESS_STAGE_CODE),
        );
    });

    it.each([...AI_EPISODE_FAIL_STAGE_CODES])(
        'код отказа %s закрывает эпизод как fail',
        code => {
            const built = buildEpisodes(
                [
                    transition('F1', STAGE.presentation, 1),
                    transition('F1', code, 6),
                ],
                { now: NOW },
            );
            expect(built).toHaveLength(1);
            expect(built[0]).toMatchObject({
                end: 'fail',
                endReason: 'fail-stage',
                durationDays: 5,
            });
        },
    );

    it('«Не Беспокоить» (семантика F, кода в списке отказов нет) — тоже отказ, без хвоста цензуры', () => {
        // Стадия добавлена на портале 15.09.2026 в обход списка отказных
        // кодов модели: клиент просил не звонить, продажи не будет. Эпизод
        // обязан закрыться по семантике стадии, а не остаться «открытым»
        // навсегда — иначе такая сделка сидела бы в ожидании от пайплайна.
        expect(AI_EPISODE_FAIL_STAGE_CODES).not.toContain(STAGE.notCall);
        const built = buildEpisodes(
            [
                transition('N1', STAGE.presentation, 1),
                {
                    entityId: 'N1',
                    stageCode: STAGE.notCall,
                    order: getSalesBaseStageOrder(STAGE.notCall),
                    semantic: 'F',
                    at: day(9),
                },
            ],
            { now: NOW },
        );
        expect(built).toHaveLength(1);
        expect(built[0]).toMatchObject({
            end: 'fail',
            endReason: 'fail-stage',
            durationDays: 8,
            success: false,
        });
    });

    it('открытый эпизод даёт цензуру и пустую длительность', () => {
        const censored = episodes.find(episode => episode.end === 'censored');
        expect(censored).toMatchObject({
            key: episodeKeyOf('D3', 1),
            stageCode: STAGE.warm,
            endedAt: null,
            toStageCode: null,
            toOrder: null,
            durationDays: null,
            endReason: 'open',
            success: false,
        });
        expect(censored?.ageDays).toBe(daysBetween(day(4), NOW));
    });

    it('после терминальной стадии цензурированного эпизода не появляется', () => {
        expect(
            episodes.filter(
                episode =>
                    episode.entityId !== 'D3' && episode.end === 'censored',
            ),
        ).toHaveLength(0);
    });

    it('откат на стадию ниже — тоже конец эпизода, но rollback', () => {
        const [episode] = buildEpisodes(
            [
                transition('R1', STAGE.presentation, 2),
                transition('R1', STAGE.cold, 9),
            ],
            { now: NOW },
        );
        expect(episode).toMatchObject({
            end: 'fail',
            endReason: 'rollback',
            durationDays: 7,
        });
    });
});

describe('buildEpisodes: нормализация входа', () => {
    it('переходы сортируются по времени независимо от порядка на входе', () => {
        const episodes = buildEpisodes(
            [
                transition('D9', STAGE.presentation, 5),
                transition('D9', STAGE.new, 1),
                transition('D9', STAGE.success, 12),
            ],
            { now: NOW },
        );
        expect(episodes.map(episode => episode.stageCode)).toEqual([
            STAGE.new,
            STAGE.presentation,
        ]);
        expect(episodes[1].durationDays).toBe(7);
    });

    it('повтор одной и той же стадии подряд не создаёт пустого эпизода', () => {
        const episodes = buildEpisodes(
            [
                transition('D8', STAGE.presentation, 1),
                transition('D8', STAGE.presentation, 2),
                transition('D8', STAGE.success, 4),
            ],
            { now: NOW },
        );
        expect(episodes).toHaveLength(1);
        expect(episodes[0].durationDays).toBe(3);
    });

    it('переход с неразбираемым моментом отбрасывается', () => {
        const broken: StageTransition = {
            ...transition('D7', STAGE.cold, 2),
            at: 'не дата',
        };
        const episodes = buildEpisodes(
            [transition('D7', STAGE.new, 1), broken],
            { now: NOW },
        );
        expect(episodes).toHaveLength(1);
        expect(episodes[0]).toMatchObject({
            stageCode: STAGE.new,
            end: 'censored',
        });
    });

    it('коды отказа и продажи можно переопределить параметром', () => {
        const [episode] = buildEpisodes(
            [
                transition('D6', STAGE.new, 1),
                {
                    ...transition('D6', STAGE.moneyAwait, 3),
                    semantic: 'P',
                },
            ],
            {
                now: NOW,
                failStageCodes: [STAGE.moneyAwait],
                successStageCode: STAGE.supply,
            },
        );
        expect(episode).toMatchObject({ end: 'fail', endReason: 'fail-stage' });
    });
});

describe('groupEpisodesByEntity и episodeAt', () => {
    const episodes = buildEpisodes(
        [
            transition('D1', STAGE.new, 1),
            transition('D1', STAGE.presentation, 5),
            transition('D2', STAGE.new, 2),
        ],
        { now: NOW },
    );
    const byEntity = groupEpisodesByEntity(episodes);

    it('группирует эпизоды по сущности в порядке index', () => {
        expect(Object.keys(byEntity).sort()).toEqual(['D1', 'D2']);
        expect(byEntity.D1.map(episode => episode.index)).toEqual([0, 1]);
    });

    it('накрывающий эпизод берётся по полуинтервалу [start; end)', () => {
        expect(episodeAt(byEntity.D1, day(3))?.stageCode).toBe(STAGE.new);
        expect(episodeAt(byEntity.D1, day(5))?.stageCode).toBe(
            STAGE.presentation,
        );
        expect(episodeAt(byEntity.D1, day(20))?.stageCode).toBe(
            STAGE.presentation,
        );
    });

    it('момент до начала сделки не накрыт ни одним эпизодом', () => {
        expect(episodeAt(byEntity.D2, day(1))).toBeNull();
        expect(episodeAt(byEntity.D2, 'не дата')).toBeNull();
    });
});
