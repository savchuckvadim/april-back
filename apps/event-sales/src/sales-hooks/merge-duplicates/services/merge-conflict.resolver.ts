import { BitrixService } from '@/modules/bitrix';
import { DuplicateEntityType } from '@lib/portal-lib/pbx-duplicate';
import {
    harmonizeForMerge,
    hasHarmonizationChanges,
    MergeRow,
    MergeVictimRow,
} from '../lib/merge-harmonize';
import { formatMergeNotes, toFieldsMeta } from '../lib/merge-notes.formatter';
import { MergeGroup } from './merge-plan.service';

interface CrmMethods {
    get: string;
    update: string;
    fields: string;
    /** ENTITY_TYPE для `crm.timeline.comment.add`. */
    timelineType: string;
}

const CRM_METHODS: Record<DuplicateEntityType, CrmMethods> = {
    [DuplicateEntityType.LEAD]: {
        get: 'crm.lead.get',
        update: 'crm.lead.update',
        fields: 'crm.lead.fields',
        timelineType: 'lead',
    },
    [DuplicateEntityType.CONTACT]: {
        get: 'crm.contact.get',
        update: 'crm.contact.update',
        fields: 'crm.contact.fields',
        timelineType: 'contact',
    },
    [DuplicateEntityType.COMPANY]: {
        get: 'crm.company.get',
        update: 'crm.company.update',
        fields: 'crm.company.fields',
        timelineType: 'company',
    },
    [DuplicateEntityType.DEAL]: {
        get: 'crm.deal.get',
        update: 'crm.deal.update',
        fields: 'crm.deal.fields',
        timelineType: 'deal',
    },
};

export interface MergeConflictResolution {
    /** Карточки поправлены — объединение стоит повторить. */
    changed: boolean;
    /** Сколько значений дублей уступило главной карточке (они в её ленте). */
    keptInTimeline: number;
}

const NOTHING_CHANGED: MergeConflictResolution = {
    changed: false,
    keptInTimeline: 0,
};

const textOf = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : '';

/** Как назвать дубль в ленте: название, у контакта — фамилия и имя. */
const titleOf = (entityType: DuplicateEntityType, row: MergeRow): string =>
    entityType === DuplicateEntityType.CONTACT
        ? [textOf(row.LAST_NAME), textOf(row.NAME)].filter(Boolean).join(' ')
        : textOf(row.TITLE);

/**
 * Штатное объединение ответило CONFLICT — снять расхождения, чтобы его
 * можно было повторить (правила — merge-harmonize).
 *
 * Порядок записи: сначала лента главной карточки с прежними значениями
 * дублей, потом правки карточек. Оборвётся посередине — данные дублей уже
 * сохранены, а сами дубли ещё не удалены.
 *
 * Чтение — одной пачкой (в командах только id). Запись — прямыми вызовами:
 * в значениях полей свободный текст, а в строке пачки `&` и `=` ломают её
 * разбор. НЕ @Injectable: инстанс Битрикса приходит от исполнителя.
 */
export class MergeConflictResolver {
    constructor(private readonly bitrix: BitrixService) {}

    async resolve(
        group: MergeGroup,
        victimIds: readonly number[],
    ): Promise<MergeConflictResolution> {
        const methods = CRM_METHODS[group.entityType];
        const read = await this.read(methods, group.survivorId, victimIds);
        if (!read.survivor || !read.victims.length) return NOTHING_CHANGED;

        const harmonization = harmonizeForMerge(read.survivor, read.victims);
        if (!hasHarmonizationChanges(harmonization)) return NOTHING_CHANGED;

        const note = formatMergeNotes({
            notes: harmonization.notes,
            fields: read.fields,
            victimTitles: new Map(
                read.victims.map(victim => [
                    victim.id,
                    titleOf(group.entityType, victim.row),
                ]),
            ),
        });
        if (note) {
            await this.bitrix.api.call('crm.timeline.comment.add', {
                fields: {
                    ENTITY_ID: group.survivorId,
                    ENTITY_TYPE: methods.timelineType,
                    COMMENT: note,
                },
            });
        }
        if (Object.keys(harmonization.survivorPatch).length) {
            await this.bitrix.api.call(methods.update, {
                id: group.survivorId,
                fields: harmonization.survivorPatch,
            });
        }
        for (const [victimId, fields] of harmonization.victimPatches) {
            await this.bitrix.api.call(methods.update, {
                id: victimId,
                fields,
            });
        }
        return { changed: true, keptInTimeline: harmonization.notes.length };
    }

    private async read(
        methods: CrmMethods,
        survivorId: number,
        victimIds: readonly number[],
    ) {
        for (const id of [survivorId, ...victimIds]) {
            this.bitrix.api.addCmdBatch(`mc_get_${id}`, methods.get, { id });
        }
        this.bitrix.api.addCmdBatch('mc_fields', methods.fields, {});
        const responses = await this.bitrix.api.callBatchAsync();

        const flat = new Map<string, unknown>();
        for (const chunk of responses) {
            for (const [cmd, value] of Object.entries(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                flat.set(cmd, value);
            }
        }
        const rowOf = (id: number): MergeRow | null => {
            const value = flat.get(`mc_get_${id}`);
            return value && typeof value === 'object'
                ? (value as MergeRow)
                : null;
        };
        const victims = victimIds
            .map(id => ({ id, row: rowOf(id) }))
            .filter((victim): victim is MergeVictimRow => victim.row !== null);
        return {
            survivor: rowOf(survivorId),
            victims,
            fields: toFieldsMeta(flat.get('mc_fields')),
        };
    }
}
