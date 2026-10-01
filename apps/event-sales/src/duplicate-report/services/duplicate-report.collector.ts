import { BitrixService } from '@/modules/bitrix';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { ActiveStaffService } from '../../shared/active-staff/active-staff.service';
import { toId } from '../../shared/department-heads/department-heads.util';
import { classifyClients } from '../lib/duplicate-classify';
import {
    buildClientInputs,
    excludeOwners,
    groupDealsByClient,
    responsibleIds,
} from '../lib/duplicate-groups';
import {
    ClassifiedClient,
    DuplicateGroup,
} from '../types/duplicate-report.types';
import { DuplicateContextReader } from './duplicate-context.reader';
import { DuplicateDealsReader } from './duplicate-deals.reader';

/** Что прочитано и разобрано по порталу. */
export interface DuplicateSnapshot {
    /** Открытых сделок воронки прочитано. */
    readonly scanned: number;
    /** Клиенты-дубли в порядке отчёта. */
    readonly clients: readonly ClassifiedClient[];
    /** Владелец вебхука: постановщик задач и «автоматика» в разборе. */
    readonly ownerId: number | null;
}

export interface DuplicateCollectInput {
    readonly now: Date;
    /** Начало периода отчёта — граница «новое за неделю». */
    readonly periodStart: Date;
    /** Конец периода (начало дня отчёта), не включая. */
    readonly periodEnd: Date;
    readonly excludeUserIds: readonly number[];
}

/**
 * Чтение портала и разбор клиентов: сделки → клиенты с 2+ сделками →
 * минус исключённые сотрудники → лиды/задачи/подписи → кто работает →
 * классификация. Чтение строго последовательное: все шаги ходят в один
 * инстанс Битрикса, и batch-очередь у него общая (ai/rules/bitrix-batch-grouping.md).
 *
 * НЕ `@Injectable`: инстанс Битрикса приходит параметром (CLAUDE.md).
 */
export class DuplicateReportCollector {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
        private readonly domain: string,
        private readonly staff: Pick<ActiveStaffService, 'activeUserIds'>,
    ) {}

    async collect(
        input: DuplicateCollectInput,
        warnings: string[],
    ): Promise<DuplicateSnapshot> {
        const deals = await new DuplicateDealsReader(
            this.bitrix,
            this.portal,
        ).load();
        const groups = excludeOwners(
            groupDealsByClient(deals),
            input.excludeUserIds,
        );
        const ownerId = await this.ownerId(warnings);
        const clients = groups.length
            ? await this.classifyGroups(groups, input, ownerId, warnings)
            : [];
        return { scanned: deals.length, clients, ownerId };
    }

    /**
     * Разбор уже собранных групп: второй проход чтения (лиды, задачи,
     * подписи), кто работает, классификация. Отдельно — для «Работы
     * клиента» в «Звонках»: там группа одна, но правила те же, что у отчёта.
     */
    async classifyGroups(
        groups: readonly DuplicateGroup[],
        period: Pick<
            DuplicateCollectInput,
            'now' | 'periodStart' | 'periodEnd'
        >,
        ownerId: number | null,
        warnings: string[],
    ): Promise<ClassifiedClient[]> {
        const context = await new DuplicateContextReader(
            this.bitrix,
            this.portal,
        ).load(groups, warnings);
        const active = await this.activeIds(responsibleIds(groups), warnings);
        return classifyClients(buildClientInputs(groups, context), {
            now: period.now.getTime(),
            periodStart: period.periodStart.getTime(),
            periodEnd: period.periodEnd.getTime(),
            activeUserIds: active,
            systemUserIds: new Set(ownerId ? [ownerId] : []),
        });
    }

    /** Владелец вебхука (`user.current`); не прочитался — null. */
    async ownerId(warnings: string[]): Promise<number | null> {
        try {
            const response = await this.bitrix.user.getCurrent();
            return toId(response?.result?.ID);
        } catch (error) {
            warnings.push(
                `владелец вебхука не определён (user.current): ${getErrorString(error)}`,
            );
            return null;
        }
    }

    /**
     * Кто из ответственных работает. Сбой — считаем работающими всех:
     * ложное «не работает» в отчёте хуже, чем пропущенная пометка.
     */
    private async activeIds(
        ids: number[],
        warnings: string[],
    ): Promise<Set<number>> {
        try {
            return await this.staff.activeUserIds(
                this.domain,
                this.bitrix,
                ids,
            );
        } catch (error) {
            warnings.push(
                `не проверено, кто из ответственных работает: ${getErrorString(error)} — все считаются работающими`,
            );
            return new Set(ids);
        }
    }
}
