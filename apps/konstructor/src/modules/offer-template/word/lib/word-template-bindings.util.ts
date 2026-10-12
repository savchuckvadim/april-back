import {
    parseClientTypes,
    parseSupplyTypes,
} from '@lib/portal-lib/konstructor/document-template';
import type { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import type { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';

/** Привязки шаблона в том виде, в котором они уходят наружу. */
export type WordTemplateBindings = {
    agent_id: string | null;
    client_types: ClientTypeEnum[] | null;
    supply_types: SupplyTypeEnum[] | null;
};

/**
 * Сырые значения из БД → разобранные для DTO.
 *
 * Один хелпер на все места сборки summary: в сервисе их три (findMany,
 * findPublic, getWordTemplateSummary), и забытое поле в любом из них не даёт
 * ни ошибки компиляции, ни ошибки рантайма — наружу просто уходит
 * `undefined`. Это ровно тот молчаливый отказ, из-за которого привязки
 * «теряются» между созданием и чтением.
 *
 * agent_id приводим к строке: bigint не сериализуется в JSON.
 * null = «годится любому» — семантику задаёт схема, см. parseClientTypes.
 */
export function toWordTemplateBindings(row: {
    agent_id?: bigint | string | null;
    client_types?: string | null;
    supply_types?: string | null;
}): WordTemplateBindings {
    return {
        agent_id: row.agent_id != null ? String(row.agent_id) : null,
        client_types: parseClientTypes(row.client_types ?? null),
        supply_types: parseSupplyTypes(row.supply_types ?? null),
    };
}
