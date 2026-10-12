import { BadRequestException } from '@nestjs/common';
import {
    SupplyReportTemplateScope,
    type SupplyReportTemplateScopeValue,
} from '../dto/supply-report-template.enums';

export type SupplyReportTemplateScopePair = {
    portal_id: bigint | null;
    agent_id: bigint | null;
};

/**
 * Выводит пару (portal_id, agent_id) из уровня привязки.
 *
 * `scope` в БД НЕ хранится — колонки `visibility` у
 * `supply_report_templates` нет. Он нужен только затем, чтобы админка
 * не могла прислать противоречивую комбинацию: «общий, но с порталом»
 * или «под поставщика, но без портала».
 *
 * Если `scope` не передан, он выводится из самих значений — так старый
 * клиент, присылающий только portal_id/agent_id, продолжает работать.
 */
export function resolveSupplyReportTemplateScope(
    scope: SupplyReportTemplateScopeValue | undefined,
    portal_id: bigint | null,
    agent_id: bigint | null,
): SupplyReportTemplateScopePair {
    const effective = scope ?? inferScope(portal_id, agent_id);

    switch (effective) {
        case SupplyReportTemplateScope.COMMON:
            // Общий шаблон — это именно portal_id IS NULL. Молча обнулять
            // присланный portal_id нельзя: админ выбрал одно, а сохранилось
            // бы другое.
            if (portal_id != null || agent_id != null) {
                throw new BadRequestException(
                    'Для scope=common нельзя указывать portal_id и agent_id: общий шаблон — это portal_id IS NULL',
                );
            }
            return { portal_id: null, agent_id: null };

        case SupplyReportTemplateScope.PORTAL:
            if (portal_id == null) {
                throw new BadRequestException(
                    'Для scope=portal нужен portal_id',
                );
            }
            if (agent_id != null) {
                throw new BadRequestException(
                    'Для scope=portal нельзя указывать agent_id — это уровень provider',
                );
            }
            return { portal_id, agent_id: null };

        case SupplyReportTemplateScope.PROVIDER:
            if (portal_id == null || agent_id == null) {
                throw new BadRequestException(
                    'Для scope=provider нужны portal_id и agent_id',
                );
            }
            return { portal_id, agent_id };
    }
}

/**
 * Уровень из значений: поставщик без портала невозможен (у поставщика
 * портал есть всегда, `agents.portalId` NOT NULL), поэтому такая пара
 * трактуется как provider и падает на проверке выше.
 */
function inferScope(
    portal_id: bigint | null,
    agent_id: bigint | null,
): SupplyReportTemplateScopeValue {
    if (agent_id != null) {
        return SupplyReportTemplateScope.PROVIDER;
    }
    if (portal_id != null) {
        return SupplyReportTemplateScope.PORTAL;
    }
    return SupplyReportTemplateScope.COMMON;
}
