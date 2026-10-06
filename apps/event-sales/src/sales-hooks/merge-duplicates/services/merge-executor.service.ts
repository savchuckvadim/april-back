import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { getErrorDetails } from '@/shared';
import { MergeGroup, MergePlan } from './merge-plan.service';
import { MergeConflictResolver } from './merge-conflict.resolver';

/** Итог выполнения одной группы. */
export interface MergeGroupResult {
    entityType: string;
    survivorId: number;
    status: 'SUCCESS' | 'CONFLICT' | 'ERROR' | 'PARTIAL';
    mergedIds: number[];
    error?: string;
}

/** Как назвать тип сущности в предупреждениях для человека. */
const ENTITY_LABEL: Record<string, string> = {
    LEAD: 'Лид',
    CONTACT: 'Контакт',
    COMPANY: 'Компания',
    DEAL: 'Сделка',
};

/** mergeBatch ~2 c на вызов — жертвы порциями, чтобы не упереться в лимиты. */
const VICTIMS_PER_CALL = 5;

/**
 * Разрушающая фаза merge: последовательные crm.entity.mergeBatch, НИКОГДА
 * не в HTTP-batch.
 *
 * Guard'ы: survivor строго ПЕРВЫЙ в entityIds (перепутанный порядок =
 * уничтожение старой сущности); ERROR — fail-fast по остальным группам.
 *
 * CONFLICT (владелец, 05.10.2026: «надо по-любому объединять все данные,
 * по возможности дополнять»): расхождения снимаются MergeConflictResolver —
 * главная карточка дополняется, значения дублей, уступившие ей, пишутся в
 * её ленту — и порция объединяется ещё раз. Только один повтор: если и
 * после этого CONFLICT, группа отдаётся человеку в штатный интерфейс. Перед каждой порцией жертвы
 * перечитываются: уже удалённые пропускаются (повтор безопасен).
 * НЕ @Injectable: new MergeExecutorService(bitrix).
 */
export class MergeExecutorService {
    private readonly logger = new Logger(MergeExecutorService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly resolver = new MergeConflictResolver(bitrix),
    ) {}

    async execute(plan: MergePlan): Promise<{
        groups: MergeGroupResult[];
        relinked: { dealId: number; companyId: number }[];
        warnings: string[];
    }> {
        const warnings: string[] = [];

        // Аддитивная фаза: перепривязка сделок к компании-survivor —
        // до разрушающей, при обрыве данные не портятся.
        const relinked: { dealId: number; companyId: number }[] = [];
        for (const entry of plan.relink) {
            try {
                await this.bitrix.deal.update(entry.dealId, {
                    COMPANY_ID: String(entry.companyId),
                } as never);
                relinked.push(entry);
            } catch (error) {
                warnings.push(
                    `Сделка ${entry.dealId}: не удалось привязать компанию ${entry.companyId} — ${getErrorDetails(error).message}`,
                );
            }
        }

        const groups: MergeGroupResult[] = [];
        let failFast = false;
        for (const group of plan.groups) {
            if (failFast) {
                groups.push({
                    entityType: group.entityType,
                    survivorId: group.survivorId,
                    status: 'ERROR',
                    mergedIds: [],
                    error: 'Пропущена: предыдущая группа завершилась ошибкой',
                });
                continue;
            }
            const result = await this.mergeGroup(group, warnings);
            groups.push(result);
            if (result.status === 'ERROR') failFast = true;
        }

        return { groups, relinked, warnings };
    }

    private async mergeGroup(
        group: MergeGroup,
        warnings: string[],
    ): Promise<MergeGroupResult> {
        const mergedIds: number[] = [];
        const pendingVictims = [...group.victimIds];

        while (pendingVictims.length) {
            const portion = pendingVictims.splice(0, VICTIMS_PER_CALL);
            const entityIds = [group.survivorId, ...portion];

            // САМАЯ ОПАСНАЯ СТРОКА ФИЧИ: mergeBatch сливает в ПЕРВЫЙ элемент.
            if (entityIds[0] !== group.survivorId) {
                throw new Error(
                    `merge-guard: survivor ${group.survivorId} не первый в entityIds — отмена`,
                );
            }

            try {
                let result = await this.mergePortion(group, entityIds);
                if (
                    result?.STATUS === 'CONFLICT' &&
                    (await this.resolveConflict(group, portion, warnings))
                ) {
                    result = await this.mergePortion(group, entityIds);
                }
                if (result?.STATUS === 'SUCCESS') {
                    mergedIds.push(...(result.ENTITY_IDS ?? portion));
                    continue;
                }
                if (result?.STATUS === 'CONFLICT') {
                    // Поля выровнены, а Битрикс всё равно отказал — решает
                    // человек в штатном интерфейсе.
                    return {
                        entityType: group.entityType,
                        survivorId: group.survivorId,
                        status: mergedIds.length ? 'PARTIAL' : 'CONFLICT',
                        mergedIds,
                        error: 'Битрикс сообщил CONFLICT и после выравнивания полей: разрешите объединение в штатном интерфейсе дублей',
                    };
                }
                return {
                    entityType: group.entityType,
                    survivorId: group.survivorId,
                    status: mergedIds.length ? 'PARTIAL' : 'ERROR',
                    mergedIds,
                    error: `mergeBatch STATUS=${result?.STATUS ?? 'нет ответа'}`,
                };
            } catch (error) {
                const { message } = getErrorDetails(error);
                this.logger.error(
                    `mergeBatch ${group.entityType} survivor=${group.survivorId}: ${message}`,
                );
                return {
                    entityType: group.entityType,
                    survivorId: group.survivorId,
                    status: mergedIds.length ? 'PARTIAL' : 'ERROR',
                    mergedIds,
                    error: message,
                };
            }
        }

        return {
            entityType: group.entityType,
            survivorId: group.survivorId,
            status: 'SUCCESS',
            mergedIds,
        };
    }

    private async mergePortion(group: MergeGroup, entityIds: number[]) {
        const response = await this.bitrix.crmEntity.mergeBatch({
            entityTypeId: group.entityTypeId,
            entityIds,
        });
        return response?.result;
    }

    /**
     * Снять расхождения перед повтором. Сбой здесь не рушит остальные
     * группы: объединение ещё не начиналось, группа просто остаётся
     * конфликтной.
     *
     * @returns true — карточки поправлены, порцию стоит объединить ещё раз.
     */
    private async resolveConflict(
        group: MergeGroup,
        portion: number[],
        warnings: string[],
    ): Promise<boolean> {
        const label = `${ENTITY_LABEL[group.entityType] ?? 'Карточка'} ${group.survivorId}`;
        try {
            const resolution = await this.resolver.resolve(group, portion);
            if (resolution.keptInTimeline) {
                warnings.push(
                    `${label}: поля дублей выровнены по главной карточке, ` +
                        `прежние значения (${resolution.keptInTimeline}) записаны в её ленту`,
                );
            }
            return resolution.changed;
        } catch (error) {
            const { message } = getErrorDetails(error);
            this.logger.error(
                `merge-conflict ${group.entityType} survivor=${group.survivorId}: ${message}`,
            );
            warnings.push(
                `${label}: не удалось выровнять поля перед объединением — ${message}`,
            );
            return false;
        }
    }
}
