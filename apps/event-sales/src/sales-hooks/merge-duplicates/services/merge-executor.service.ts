import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { getErrorDetails } from '@/shared';
import { MergeGroup, MergePlan } from './merge-plan.service';

/** Итог выполнения одной группы. */
export interface MergeGroupResult {
    entityType: string;
    survivorId: number;
    status: 'SUCCESS' | 'CONFLICT' | 'ERROR' | 'PARTIAL';
    mergedIds: number[];
    error?: string;
}

/** mergeBatch ~2 c на вызов — жертвы порциями, чтобы не упереться в лимиты. */
const VICTIMS_PER_CALL = 5;

/**
 * Разрушающая фаза merge: последовательные crm.entity.mergeBatch, НИКОГДА
 * не в HTTP-batch.
 *
 * Guard'ы: survivor строго ПЕРВЫЙ в entityIds (перепутанный порядок =
 * уничтожение старой сущности); CONFLICT не ретраится и не «дочищается»
 * руками — группа отдаётся во фронт со ссылкой на штатный интерфейс;
 * ERROR — fail-fast по остальным группам. Перед каждой порцией жертвы
 * перечитываются: уже удалённые пропускаются (повтор безопасен).
 * НЕ @Injectable: new MergeExecutorService(bitrix).
 */
export class MergeExecutorService {
    private readonly logger = new Logger(MergeExecutorService.name);

    constructor(private readonly bitrix: BitrixService) {}

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
            const result = await this.mergeGroup(group);
            groups.push(result);
            if (result.status === 'ERROR') failFast = true;
        }

        return { groups, relinked, warnings };
    }

    private async mergeGroup(group: MergeGroup): Promise<MergeGroupResult> {
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
                const response = await this.bitrix.crmEntity.mergeBatch({
                    entityTypeId: group.entityTypeId,
                    entityIds,
                });
                const result = response?.result;
                if (result?.STATUS === 'SUCCESS') {
                    mergedIds.push(...(result.ENTITY_IDS ?? portion));
                    continue;
                }
                if (result?.STATUS === 'CONFLICT') {
                    // Противоречивые данные — решает человек в штатном UI.
                    return {
                        entityType: group.entityType,
                        survivorId: group.survivorId,
                        status: mergedIds.length ? 'PARTIAL' : 'CONFLICT',
                        mergedIds,
                        error: 'Битрикс сообщил CONFLICT: разрешите объединение в штатном интерфейсе дублей',
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
}
