import { createHash } from 'crypto';
import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    DUPLICATE_ENTITY_TYPE_ID,
    DuplicateEntityType,
    resolveDuplicateDealCategories,
} from '@lib/portal-lib/pbx-duplicate';

type BxRow = Record<string, unknown>;

/** Участник merge после чтения из Битрикса. */
export interface MergeParticipant {
    entityType: DuplicateEntityType;
    entityTypeId: number;
    id: number;
    title: string;
    dateCreate: string;
    categoryId?: number;
    companyId?: number;
}

/** Группа однотипных: сливается штатным mergeBatch. */
export interface MergeGroup {
    entityType: DuplicateEntityType;
    entityTypeId: number;
    /** ПЕРВЫЙ — survivor: в него сливается всё, остальные УДАЛЯЮТСЯ. */
    survivorId: number;
    victimIds: number[];
}

/** План merge — результат read-only фазы (он же ответ dryRun). */
export interface MergePlan {
    participants: MergeParticipant[];
    groups: MergeGroup[];
    /** Кросс-типовые привязки: сделка → компания-survivor. */
    relink: { dealId: number; companyId: number }[];
    /** Отброшенные с причинами (чужие воронки, не найдены). */
    skipped: string[];
    warnings: string[];
    /** Подпись плана: выполнение требует совпадения (портал не изменился). */
    planHash: string;
}

const GET_METHOD: Record<DuplicateEntityType, string> = {
    [DuplicateEntityType.LEAD]: 'crm.lead.get',
    [DuplicateEntityType.CONTACT]: 'crm.contact.get',
    [DuplicateEntityType.COMPANY]: 'crm.company.get',
    [DuplicateEntityType.DEAL]: 'crm.deal.get',
};

/**
 * Read-only построение плана merge (= всё тело dryRun): один batch чтения,
 * НИ ОДНОЙ записи.
 *
 * Правила: survivor — самый СТАРЫЙ (min DATE_CREATE, тай-брейк min ID);
 * сделки чужих воронок не участвуют вовсе; разнотипных не сливаем —
 * только перепривязываем (сделка получает компанию-survivor).
 * НЕ @Injectable: new MergePlanService(bitrix, portal).
 */
export class MergePlanService {
    private readonly logger = new Logger(MergePlanService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async build(entityRefs: string[]): Promise<MergePlan> {
        const warnings: string[] = [];
        const skipped: string[] = [];

        const refs = this.parseRefs(entityRefs, skipped);
        for (const ref of refs) {
            this.bitrix.api.addCmdBatch(
                `mp_${ref.entityType}_${ref.id}`,
                GET_METHOD[ref.entityType],
                { id: ref.id },
            );
        }
        const responses = await this.bitrix.api.callBatchAsync();
        const flat = new Map<string, unknown>();
        for (const chunk of responses) {
            for (const [cmd, value] of Object.entries(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                flat.set(cmd, value);
            }
        }

        const categories = resolveDuplicateDealCategories(this.portal);
        warnings.push(...categories.warnings);
        const allowedCategories = new Set(categories.allowedBitrixIds);

        const participants: MergeParticipant[] = [];
        for (const ref of refs) {
            const row = flat.get(`mp_${ref.entityType}_${ref.id}`) as
                | BxRow
                | undefined;
            if (!row || typeof row !== 'object') {
                skipped.push(
                    `${ref.entityType}_${ref.id}: не найдена на портале`,
                );
                continue;
            }
            if (ref.entityType === DuplicateEntityType.DEAL) {
                const categoryId = Number(row.CATEGORY_ID);
                if (!allowedCategories.has(categoryId)) {
                    skipped.push(
                        `DEAL_${ref.id}: чужая воронка (CATEGORY_ID=${categoryId}) — не трогаем`,
                    );
                    continue;
                }
            }
            participants.push({
                entityType: ref.entityType,
                entityTypeId: DUPLICATE_ENTITY_TYPE_ID[ref.entityType],
                id: ref.id,
                title: this.textOf(row.TITLE) || `${ref.entityType} ${ref.id}`,
                dateCreate: this.textOf(row.DATE_CREATE),
                categoryId: this.numberOf(row.CATEGORY_ID) ?? undefined,
                companyId: this.numberOf(row.COMPANY_ID) ?? undefined,
            });
        }

        const groups = this.buildGroups(participants);
        const relink = this.buildRelink(participants, groups, warnings);

        const plan: MergePlan = {
            participants,
            groups,
            relink,
            skipped,
            warnings,
            planHash: '',
        };
        plan.planHash = this.hashOf(plan);
        return plan;
    }

    /** Однотипные ≥2 → группа со survivor'ом (самый старый; тай-брейк min ID). */
    private buildGroups(participants: MergeParticipant[]): MergeGroup[] {
        const byType = new Map<DuplicateEntityType, MergeParticipant[]>();
        for (const participant of participants) {
            const list = byType.get(participant.entityType) ?? [];
            list.push(participant);
            byType.set(participant.entityType, list);
        }

        const groups: MergeGroup[] = [];
        for (const [entityType, members] of byType) {
            if (members.length < 2) continue;
            const survivor = this.pickSurvivor(members);
            groups.push({
                entityType,
                entityTypeId: DUPLICATE_ENTITY_TYPE_ID[entityType],
                survivorId: survivor.id,
                victimIds: members
                    .filter(member => member.id !== survivor.id)
                    .map(member => member.id),
            });
        }
        return groups;
    }

    /** Родительской остаётся та, что существует дольше (решение ТЗ). */
    private pickSurvivor(members: MergeParticipant[]): MergeParticipant {
        return [...members].sort((a, b) => {
            const dateA = Date.parse(a.dateCreate) || Number.MAX_SAFE_INTEGER;
            const dateB = Date.parse(b.dateCreate) || Number.MAX_SAFE_INTEGER;
            return dateA - dateB || a.id - b.id;
        })[0];
    }

    /**
     * Кросс-тип: сделки без компании получают компанию-survivor (или
     * единственную компанию плана) — «выяснилась компания».
     */
    private buildRelink(
        participants: MergeParticipant[],
        groups: MergeGroup[],
        warnings: string[],
    ): { dealId: number; companyId: number }[] {
        const companies = participants.filter(
            participant =>
                participant.entityType === DuplicateEntityType.COMPANY,
        );
        if (!companies.length) return [];

        const companyGroup = groups.find(
            group => group.entityType === DuplicateEntityType.COMPANY,
        );
        const targetCompanyId = companyGroup
            ? companyGroup.survivorId
            : companies.length === 1
              ? companies[0].id
              : null;
        if (!targetCompanyId) {
            warnings.push(
                'Несколько компаний без merge-группы — перепривязка сделок пропущена',
            );
            return [];
        }

        return participants
            .filter(
                participant =>
                    participant.entityType === DuplicateEntityType.DEAL &&
                    participant.companyId !== targetCompanyId,
            )
            .map(participant => ({
                dealId: participant.id,
                companyId: targetCompanyId,
            }));
    }

    private parseRefs(
        entityRefs: string[],
        skipped: string[],
    ): { entityType: DuplicateEntityType; id: number }[] {
        const refs: { entityType: DuplicateEntityType; id: number }[] = [];
        const seen = new Set<string>();
        for (const raw of entityRefs) {
            const match = /^(LEAD|DEAL|CONTACT|COMPANY)_(\d+)$/.exec(
                raw.trim(),
            );
            if (!match) {
                skipped.push(`${raw}: неверный формат ссылки`);
                continue;
            }
            const key = `${match[1]}_${match[2]}`;
            if (seen.has(key)) continue;
            seen.add(key);
            refs.push({
                entityType: match[1] as DuplicateEntityType,
                id: Number(match[2]),
            });
        }
        return refs;
    }

    /** Подпись: refs + survivors. Детерминирована сортировкой. */
    private hashOf(plan: MergePlan): string {
        const payload = JSON.stringify({
            participants: plan.participants
                .map(
                    participant =>
                        `${participant.entityType}_${participant.id}`,
                )
                .sort(),
            groups: plan.groups
                .map(
                    group =>
                        `${group.entityType}:${group.survivorId}<${[...group.victimIds].sort((a, b) => a - b).join(',')}`,
                )
                .sort(),
            relink: plan.relink
                .map(entry => `${entry.dealId}>${entry.companyId}`)
                .sort(),
        });
        return createHash('md5').update(payload).digest('hex');
    }

    private numberOf(raw: unknown): number | null {
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    private textOf(raw: unknown): string {
        if (typeof raw === 'string') return raw.trim();
        if (typeof raw === 'number') return String(raw);
        return '';
    }
}
