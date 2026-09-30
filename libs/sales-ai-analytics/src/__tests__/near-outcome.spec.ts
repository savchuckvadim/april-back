import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    getSalesBaseStageOrder,
    type PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    type DealEpisode,
    type StageTransition,
    buildEpisodes,
    episodeAt,
    groupEpisodesByEntity,
} from '../model/episode';
import {
    AI_NEAR_OUTCOME_REASONS,
    NEAR_OUTCOME_DEFAULTS,
    NEAR_OUTCOME_TARGET_ORDER,
    NEAR_OUTCOME_TARGET_STAGE_CODE,
    nearOutcomeOf,
} from '../model/near-outcome';
import { registryDefault } from '../params/registry.access';

/** Переход стадии сделки в день `day` марта 2026 (TZ портала +03:00). */
const at = (day: number): string =>
    `2026-03-${String(day).padStart(2, '0')}T12:00:00+03:00`;

const transition = (
    entityId: string,
    code: PbxDealSalesBaseStageCode,
    day: number,
): StageTransition => ({
    entityId,
    stageCode: code,
    order: getSalesBaseStageOrder(code),
    semantic:
        code === PBX_DEAL_SALES_BASE_STAGE_CODE.fail
            ? 'F'
            : code === PBX_DEAL_SALES_BASE_STAGE_CODE.success
              ? 'S'
              : 'P',
    at: at(day),
});

const STAGE = PBX_DEAL_SALES_BASE_STAGE_CODE;
const NOW = at(31);

/** Эпизоды по сделкам: презентация 1 марта, далее по сценарию. */
const transitions: StageTransition[] = [
    transition('offer', STAGE.presentation, 1),
    transition('offer', STAGE.offerCreate, 8),
    transition('lost', STAGE.presentation, 1),
    transition('lost', STAGE.fail, 6),
    transition('refined', STAGE.presentation, 1),
    transition('refined', STAGE.refine, 4),
    transition('refined', STAGE.offerCreate, 11),
    transition('rolled', STAGE.presentation, 1),
    transition('rolled', STAGE.refine, 4),
    transition('rolled', STAGE.warm, 9),
    transition('late', STAGE.presentation, 1),
    transition('late', STAGE.offerCreate, 20),
    transition('open', STAGE.presentation, 1),
    transition('sold', STAGE.presentation, 1),
    transition('sold', STAGE.success, 10),
];

const byEntity = groupEpisodesByEntity(
    buildEpisodes(transitions, { now: NOW }),
);

const episodeOf = (entityId: string, callAt: string): DealEpisode => {
    const episode = episodeAt(byEntity[entityId], callAt);
    if (!episode) {
        throw new Error(`нет эпизода ${entityId} на ${callAt}`);
    }

    return episode;
};

const outcomeOf = (entityId: string, day: number, now: string = NOW) =>
    nearOutcomeOf(episodeOf(entityId, at(day)), at(day), {
        now,
        following: byEntity[entityId],
    });

describe('nearOutcomeOf — ближний исход эпизода (план §4.4)', () => {
    it('цель — стадия КП/счёт лестницы sales_base, окно — из реестра', () => {
        expect(NEAR_OUTCOME_TARGET_STAGE_CODE).toBe(STAGE.offerCreate);
        expect(NEAR_OUTCOME_TARGET_ORDER).toBe(
            getSalesBaseStageOrder(STAGE.offerCreate),
        );
        expect(NEAR_OUTCOME_DEFAULTS.windowDays).toBe(
            registryDefault('lag_window_near_days'),
        );
        expect(AI_NEAR_OUTCOME_REASONS).toEqual([
            'advance',
            'fail',
            'window-elapsed',
            'censored',
        ]);
    });

    it('переход к КП в окне — исход 1 с числом дней', () => {
        expect(outcomeOf('offer', 2)).toEqual({
            outcome: 1,
            reason: 'advance',
            daysToOutcome: 6,
        });
    });

    it('продажа выше КП по лестнице — тоже продвижение', () => {
        expect(outcomeOf('sold', 2)).toEqual({
            outcome: 1,
            reason: 'advance',
            daysToOutcome: 8,
        });
    });

    it('отказ в окне — исход 0', () => {
        expect(outcomeOf('lost', 2)).toEqual({
            outcome: 0,
            reason: 'fail',
            daysToOutcome: 4,
        });
    });

    it('презентация → доработка → КП внутри окна — исход 1 по цепочке', () => {
        expect(outcomeOf('refined', 2)).toEqual({
            outcome: 1,
            reason: 'advance',
            daysToOutcome: 9,
        });
    });

    it('откат после доработки — исход 0 (rollback = fail)', () => {
        expect(outcomeOf('rolled', 2)).toEqual({
            outcome: 0,
            reason: 'fail',
            daysToOutcome: 7,
        });
    });

    it('без цепочки продвижение ниже КП с истёкшим окном даёт 0', () => {
        const episode = episodeOf('refined', at(2));
        expect(nearOutcomeOf(episode, at(2), { now: NOW })).toEqual({
            outcome: 0,
            reason: 'window-elapsed',
            daysToOutcome: null,
        });
    });

    it('КП позже окна — окно истекло без исхода', () => {
        expect(outcomeOf('late', 2)).toEqual({
            outcome: 0,
            reason: 'window-elapsed',
            daysToOutcome: null,
        });
    });

    it('открытый эпизод: окно не истекло — цензура, истекло — 0', () => {
        expect(outcomeOf('open', 2, at(10))).toEqual({
            outcome: null,
            reason: 'censored',
            daysToOutcome: null,
        });
        expect(outcomeOf('open', 2, at(16))).toEqual({
            outcome: 0,
            reason: 'window-elapsed',
            daysToOutcome: null,
        });
    });

    it('окно параметром: при 5 днях КП на 7-й день уже вне окна', () => {
        const episode = episodeOf('offer', at(2));
        expect(
            nearOutcomeOf(episode, at(2), { now: NOW, windowDays: 5 }).outcome,
        ).toBe(0);
        expect(
            nearOutcomeOf(episode, at(2), { now: NOW, windowDays: 7 }).outcome,
        ).toBe(1);
    });

    it('неразбираемое время — цензура', () => {
        const episode = episodeOf('offer', at(2));
        expect(
            nearOutcomeOf(episode, 'вчера', { now: NOW }).outcome,
        ).toBeNull();
        expect(
            nearOutcomeOf(episode, at(2), { now: 'потом' }).outcome,
        ).toBeNull();
    });

    it('чужие сделки в `following` не влияют', () => {
        const episode = episodeOf('late', at(2));
        const result = nearOutcomeOf(episode, at(2), {
            now: NOW,
            following: byEntity.offer,
        });
        expect(result.outcome).toBe(0);
        expect(result.reason).toBe('window-elapsed');
    });

    it('детерминизм: повторный вызов даёт тот же объект', () => {
        expect(outcomeOf('refined', 2)).toEqual(outcomeOf('refined', 2));
    });
});
