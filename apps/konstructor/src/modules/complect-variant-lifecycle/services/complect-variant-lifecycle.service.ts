import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    buildComplectVariantStageId,
    COMPLECT_VARIANT_FINAL_STAGES,
    COMPLECT_VARIANT_SMART_STAGES,
    COMPLECT_VARIANT_SMART_TYPE,
    COMPLECT_VARIANT_STAGE,
    ComplectVariantStageCode,
    resolveComplectVariantStageCode,
} from '@lib/portal-lib/pbx/pbx-complect-variant-smart';

/** Порядок стадии в воронке; неизвестная — 0 (как черновик). */
const stageSort = (stage: ComplectVariantStageCode | null): number =>
    COMPLECT_VARIANT_SMART_STAGES.find(item => item.code === stage)?.sort ?? 0;

/**
 * Можно ли ставить стадию «только вперёд»: вариант уже дальше по воронке или
 * закрыт — не откатываем. КП перегенерируют по многу раз, и «Договор» не
 * должен превращаться обратно в «КП».
 */
export const isForwardMove = (
    current: ComplectVariantStageCode | null,
    target: ComplectVariantStageCode,
): boolean => {
    if (current && COMPLECT_VARIANT_FINAL_STAGES.includes(current))
        return false;
    return stageSort(target) > stageSort(current);
};

/** Итог перевода пачки вариантов на стадию. */
export interface ComplectVariantLifecycleResult {
    /** Сколько элементов попросили перевести (после дедупликации id). */
    requested: number;
    /** Сколько реально переведено: `crm.item.update` вернул элемент. */
    moved: number;
    /**
     * Сколько пропущено: элемент уже на нужной стадии, у него нет `stageId`,
     * он не прочитался или Битрикс отказал. Пропуск — не ошибка: сервис
     * best-effort, робот из-за него падать не должен.
     */
    skipped: number;
}

/** Нулевой результат: делать было нечего. */
const emptyResult = (requested: number): ComplectVariantLifecycleResult => ({
    requested,
    moved: 0,
    skipped: requested,
});

/**
 * Жизненный цикл варианта комплекта: перевод элементов смарта
 * `complect_variant` по стадиям.
 *
 * ЗАЧЕМ. Варианты копятся на сделке годами: часть уезжает в поставку, часть
 * так и остаётся черновиками прошлых периодов. Пока стадию двигали только
 * кнопки конструктора, через год на карточке лежала куча одинаковых
 * «Черновиков» без следов того, чем кончилось дело. Здесь — автоматическая
 * простановка финальных стадий: уехал в поставку → «Успех», не уехал →
 * «Не состоялся».
 *
 * ЧТО ЕЩЁ ПЛАНИРУЕТСЯ (КП, счёт, договор, поставка, согласование) и почему
 * сейчас реализованы только успех/отказ — в README рядом с сервисом.
 *
 * Не `@Injectable`: внутри per-request инстанс `BitrixService` и `PortalModel`
 * конкретного портала (CLAUDE.md — держать `this.bitrix` в синглтоне нельзя).
 */
export class ComplectVariantLifecycleService {
    private readonly logger = new Logger(ComplectVariantLifecycleService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portalModel: PortalModel,
    ) {}

    /** Варианты, которые доехали до поставки и поставка принята. */
    async markSuccess(
        domain: string,
        variantSmartIds: readonly number[],
    ): Promise<ComplectVariantLifecycleResult> {
        return this.markStage(
            domain,
            variantSmartIds,
            COMPLECT_VARIANT_STAGE.SUCCESS,
        );
    }

    /**
     * Варианты, которые НЕ доехали: их не выбрали, и сделка уехала без них.
     *
     * Ставится `cvar_failed` («Не состоялся»), а НЕ `cvar_rejected`: «Отклонён»
     * — ручное решение менеджера в конструкторе, и затирать им автоматический
     * итог нельзя, иначе в отчётах пропадёт разница между «клиент отказался» и
     * «просто выбрали другой набор».
     */
    async markRejected(
        domain: string,
        variantSmartIds: readonly number[],
    ): Promise<ComplectVariantLifecycleResult> {
        return this.markStage(
            domain,
            variantSmartIds,
            COMPLECT_VARIANT_STAGE.FAILED,
        );
    }

    /**
     * Перевести элементы смарта на стадию `stage`.
     *
     * Устойчив ко всему, что может отсутствовать на портале: смарт не
     * установлен, у типа выключены стадии, элемент удалён — сервис тихо
     * ничего не делает и пишет в лог. Ни одно из этих состояний не должно
     * ронять робота, который его позвал.
     */
    /**
     * Стадия продажи «только вперёд» (КП → счёт → договор → поставка):
     * элемент дальше по воронке или закрытый остаётся где был. Это и есть
     * правило из README для переделок: откат — только руками.
     */
    async markStageForward(
        domain: string,
        variantSmartIds: readonly number[],
        stage: ComplectVariantStageCode,
    ): Promise<ComplectVariantLifecycleResult> {
        return this.markStage(domain, variantSmartIds, stage, true);
    }

    async markStage(
        domain: string,
        variantSmartIds: readonly number[],
        stage: ComplectVariantStageCode,
        forwardOnly = false,
    ): Promise<ComplectVariantLifecycleResult> {
        const ids = this.normalizeIds(variantSmartIds);
        if (!ids.length) {
            return emptyResult(0);
        }

        const portalSmart = this.portalModel.getSmartByType(
            COMPLECT_VARIANT_SMART_TYPE,
        );
        if (!portalSmart?.entityTypeId) {
            // смарт на портале не установлен — стадий нет в принципе
            this.logger.debug(
                `${domain}: смарт ${COMPLECT_VARIANT_SMART_TYPE} не установлен — стадия ${stage} не проставлена`,
            );
            return emptyResult(ids.length);
        }

        const entityTypeId = Number(portalSmart.entityTypeId);
        let moved = 0;

        for (const id of ids) {
            const isMoved = await this.moveOne(
                entityTypeId,
                id,
                stage,
                forwardOnly,
            );
            if (isMoved) {
                moved += 1;
            }
        }

        this.logger.log(
            `${domain}: стадия ${stage} — запрошено ${ids.length}, переведено ${moved}`,
        );
        return { requested: ids.length, moved, skipped: ids.length - moved };
    }

    /** Один элемент. `false` — пропущен по любой причине (это не ошибка). */
    private async moveOne(
        entityTypeId: number,
        itemId: number,
        stage: ComplectVariantStageCode,
        forwardOnly = false,
    ): Promise<boolean> {
        try {
            const response = await this.bitrix.item.get(
                String(itemId),
                String(entityTypeId),
                ['id', 'stageId'],
            );
            const item = response?.result?.item;
            if (!item) {
                this.logger.warn(`Вариант ${itemId} не прочитан`);
                return false;
            }

            const currentStageId =
                typeof item.stageId === 'string' ? item.stageId : null;
            const currentStage =
                resolveComplectVariantStageCode(currentStageId);
            if (currentStage === stage) {
                // уже там: лишний update засоряет историю карточки
                return false;
            }
            if (forwardOnly && !isForwardMove(currentStage, stage)) {
                this.logger.debug(
                    `Вариант ${itemId}: стадия ${currentStage ?? '?'} дальше ${stage} — не откатываем`,
                );
                return false;
            }

            // Категорию не угадываем: префикс STATUS_ID берём у самого
            // элемента — воронка может быть не дефолтной.
            const nextStageId = buildComplectVariantStageId(
                currentStageId,
                stage,
            );
            if (!nextStageId) {
                this.logger.warn(
                    `Вариант ${itemId}: пустой stageId (у смарта выключены стадии?) — стадия ${stage} не проставлена`,
                );
                return false;
            }

            const updated = await this.bitrix.item.update(
                itemId,
                // библиотека типизирует entityTypeId константой сделки;
                // у смарта он свой — каст на границе, как в остальном коде
                entityTypeId as never,
                { stageId: nextStageId },
            );
            if (!updated?.result) {
                // схема библиотеки типизирует result как boolean, Битрикс
                // отдаёт объект элемента — обе формы ложны только при отказе
                this.logger.warn(
                    `Вариант ${itemId}: crm.item.update отказал — стадия ${stage} не проставлена`,
                );
                return false;
            }
            return true;
        } catch (error) {
            // прав на смарт может не быть, элемент мог быть удалён — молча
            // пропускаем: жизненный цикл не важнее самой поставки
            this.logger.warn(
                `Вариант ${itemId}: стадия ${stage} не проставлена — ${(error as Error).message}`,
            );
            return false;
        }
    }

    /** Только положительные целые, без дублей: один элемент двигаем один раз. */
    private normalizeIds(variantSmartIds: readonly number[]): number[] {
        const unique = new Set<number>();
        for (const raw of variantSmartIds) {
            const id = Number(raw);
            if (Number.isFinite(id) && id > 0) {
                unique.add(id);
            }
        }
        return [...unique];
    }
}
