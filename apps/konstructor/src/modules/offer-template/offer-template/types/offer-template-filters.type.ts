import type { offer_templates_visibility } from 'generated/prisma';
import type { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import type { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';

export type OfferTemplateFilters = {
    visibility?: offer_templates_visibility;
    /**
     * У OfferTemplate НЕТ колонки portal_id: привязка живёт в join-таблице
     * offer_template_portal, поэтому фильтр разворачивается в `some`.
     */
    portal_id?: bigint;
    is_active?: boolean;
    search?: string;
    /** Поставщик. Скалярная колонка без relation, фильтруется в SQL. */
    agent_id?: bigint;
    /**
     * Признаки шаблона. Отбор по ним идёт НЕ в SQL: списки лежат JSON-ом в
     * LongText, операций по массивам в строковой колонке у Prisma нет, а
     * сырой SQL в проекте запрещён. Репозиторий фильтрует их в TypeScript
     * через `listMatches`, который трактует NULL как «годится любому».
     */
    client_type?: ClientTypeEnum;
    supply_type?: SupplyTypeEnum;
};
