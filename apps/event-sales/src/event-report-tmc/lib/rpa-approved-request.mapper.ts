import { BitrixDateTime, ETimeZone } from '@lib/shared/lib/date';
import { TmcPresentationApprovedDto } from '../dto/tmc-presentation-approved.dto';
import { parseBpUserId } from './approved-presentation-flow-dto.builder';
import {
    RPA_PRESENTATION_FIELD,
    RpaPresentationFieldCode,
} from './rpa-presentation-fields.const';

/** Элемент РПА, как его отдаёт `rpa.item.list`: системные поля camelCase, UF — как есть. */
export type RpaItemRow = Record<string, unknown>;

/** Код поля РПА → UF-имя на портале (слепок); поля на портале нет — undefined. */
export type RpaFieldResolver = (
    code: RpaPresentationFieldCode,
) => string | undefined;

/** Утверждённая заявка, разобранная до параметров согласования. */
export interface ApprovedRpaRequest {
    rpaItemId: number;
    /** Когда заявка попала в текущую стадию — момент утверждения. */
    movedAt: BitrixDateTime | null;
    /** Кто перевёл заявку в стадию (утвердил). */
    movedBy: number;
    tmcDealId: number;
    managerId: number;
    deadline: BitrixDateTime;
    /** Параметры согласования — ровно те, что присылает робот. */
    dto: TmcPresentationApprovedDto;
}

export type ApprovedRpaMapping =
    | { ok: true; request: ApprovedRpaRequest }
    | { ok: false; rpaItemId: number; reason: string };

/**
 * Значение crm-поля РПА → id сущности. Легаси писало сырые id (`213065`),
 * Bitrix в crm-привязках умеет и `D_213065` / `CO_95857`; множественное
 * поле — первый элемент.
 */
export const parseRpaCrmBinding = (raw: unknown): number => {
    const value: unknown = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string' && typeof value !== 'number') return 0;
    const digits = String(value)
        .trim()
        .replace(/^[A-Za-z]+_/, '');
    const id = Number(digits);
    return Number.isInteger(id) && id > 0 ? id : 0;
};

/** Множественное текстовое поле РПА → строки через перевод строки. */
export const joinRpaMultiText = (raw: unknown): string => {
    const items: unknown[] = Array.isArray(raw) ? raw : [raw];
    return items
        .map(item => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .join('\n');
};

const text = (raw: unknown): string =>
    typeof raw === 'string' ? raw.trim() : '';

/** Поле «сотрудник» РПА: число либо `user_N`; пусто — 0. */
const rpaUser = (raw: unknown): number => {
    const value: unknown = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' || typeof value === 'number'
        ? parseBpUserId(value)
        : 0;
};

/**
 * Элемент РПА «Заявка на презентацию» в стадии «утверждено» → параметры
 * согласования, с которыми робот зовёт ручку `tmc/presentation-approved`.
 *
 * Обязательны ТМЦ-сделка, компания, менеджер ОП («Кто назначен
 * ответственным» — его заполняют при утверждении) и дата презентации:
 * без них отчёт «запланирована презентация» собрать не из чего, и робот
 * с такой заявкой тоже не справился бы.
 *
 * Дата отдаётся CRM-форматом в локали портала (`DD.MM.YYYY HH:mm:ss`) —
 * тем же написанием, что печатает робот: id операции у обоих путей один.
 */
export function mapApprovedRpaItem(
    item: RpaItemRow,
    domain: string,
    resolveField: RpaFieldResolver,
    timezone: ETimeZone,
): ApprovedRpaMapping {
    const rpaItemId = Number(item.id) || 0;
    const value = (code: RpaPresentationFieldCode): unknown => {
        const key = resolveField(code);
        return key ? item[key] : undefined;
    };

    const tmcDealId = parseRpaCrmBinding(value(RPA_PRESENTATION_FIELD.tmcDeal));
    const companyId = parseRpaCrmBinding(value(RPA_PRESENTATION_FIELD.company));
    const managerId = rpaUser(
        value(RPA_PRESENTATION_FIELD.lastPresDoneResponsible),
    );
    const deadline = BitrixDateTime.fromBitrixField(
        value(RPA_PRESENTATION_FIELD.nextPresPlanDate),
        timezone,
    );

    const missing = [
        !tmcDealId && 'ТМЦ-сделка',
        !companyId && 'компания',
        !managerId && 'менеджер ОП («Кто назначен ответственным»)',
        !deadline && 'дата презентации',
    ].filter((part): part is string => typeof part === 'string');
    if (missing.length || !deadline) {
        return {
            ok: false,
            rpaItemId,
            reason: `не заполнено: ${missing.join(', ')}`,
        };
    }

    const movedBy = Number(item.movedBy) || 0;
    // Робот шлёт ownerId из поля «Руководитель»; без него постановщиком
    // плана становится утвердивший заявку, в крайнем случае — сам менеджер.
    const ownerId =
        rpaUser(value(RPA_PRESENTATION_FIELD.ownerOp)) || movedBy || managerId;
    const tmcId = rpaUser(
        value(RPA_PRESENTATION_FIELD.lastPresPlanResponsible),
    );
    const contactId = parseRpaCrmBinding(value(RPA_PRESENTATION_FIELD.contact));
    const name = text(value(RPA_PRESENTATION_FIELD.name)) || text(item.name);

    return {
        ok: true,
        request: {
            rpaItemId,
            movedAt: BitrixDateTime.fromBitrixField(item.movedTime, timezone),
            movedBy,
            tmcDealId,
            managerId,
            deadline,
            dto: {
                domain,
                tmcDealId,
                companyId,
                contactId: contactId || undefined,
                ownerId: String(ownerId),
                managerId: String(managerId),
                tmcId: tmcId ? String(tmcId) : undefined,
                deadline: deadline.toCrmDateTime(),
                name: name || undefined,
                commentOwner:
                    joinRpaMultiText(
                        value(RPA_PRESENTATION_FIELD.ownerComment),
                    ) || undefined,
                commentTMC:
                    joinRpaMultiText(
                        value(RPA_PRESENTATION_FIELD.tmcComment),
                    ) || undefined,
                commentManager:
                    joinRpaMultiText(
                        value(RPA_PRESENTATION_FIELD.managerComment),
                    ) || undefined,
            },
        },
    };
}
