import { Injectable, Logger } from '@nestjs/common';
import { methodologyDisplayTitle } from '@lib/call-lib/call-report/methodology/methodology-display-title';
import { MethodologyRegistryService } from '@lib/call-lib/call-report/methodology/methodology-registry.service';
import {
    CHECKPOINT_BADGE_MAX_LENGTH,
    type MethodologyCheckpoint,
} from '@lib/call-lib/call-report/methodology/methodology.types';
import type { CallListPointDef, CallListPointsView } from './calls-list.types';

/** Многоточие на месте отрезанного хвоста формулировки. */
const ELLIPSIS = '…';

/** Нет методики: фильтров по пунктам нет, список работает без них. */
const noMethodology = (): CallListPointsView => ({
    methodology: null,
    defs: [],
});

/**
 * Подпись плашки пункта: название бейджа из методики; нет — формулировка
 * пункта, отрезанная до предела подписи с «…» (вместе с ним не длиннее предела).
 */
export function pointLabelOf(
    checkpoint: Pick<MethodologyCheckpoint, 'badge' | 'title'>,
): string {
    const badge = checkpoint.badge?.trim() ?? '';
    if (badge !== '') return badge;
    const title = checkpoint.title.trim();
    if (title.length <= CHECKPOINT_BADGE_MAX_LENGTH) return title;
    return `${title.slice(0, CHECKPOINT_BADGE_MAX_LENGTH - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`;
}

/** Описание пункта методики для фильтров списка. */
export function pointDefOf(
    checkpoint: MethodologyCheckpoint,
): CallListPointDef {
    return {
        code: checkpoint.code,
        label: pointLabelOf(checkpoint),
        title: checkpoint.title,
        callTypes: [...checkpoint.types],
        main: checkpoint.badgeMain === true,
    };
}

/**
 * Пункты методики портала для фильтров раздела «Разборы звонков»: какая
 * методика действует на портале (реестр методик) и её пункты — подпись
 * плашки, типы звонка, «основной» бейдж. Методики нет или реестр не
 * ответил — пусто: список работает без фильтров по пунктам.
 *
 * Без состояния портала: реестр держит свой короткий кэш на домен.
 */
@Injectable()
export class CallListPointsProvider {
    private readonly logger = new Logger(CallListPointsProvider.name);

    constructor(private readonly registry: MethodologyRegistryService) {}

    async forDomain(domain: string): Promise<CallListPointsView> {
        try {
            const resolved = await this.registry.resolve(domain);
            if (resolved === null) return noMethodology();
            const { methodology } = resolved;
            return {
                methodology: {
                    code: methodology.code,
                    title: methodologyDisplayTitle(methodology),
                },
                defs: methodology.checkpoints.map(pointDefOf),
            };
        } catch (error) {
            this.logger.warn(
                `Методика ${domain} для списка разборов не прочитана: ${(error as Error).message}`,
            );
            return noMethodology();
        }
    }
}
