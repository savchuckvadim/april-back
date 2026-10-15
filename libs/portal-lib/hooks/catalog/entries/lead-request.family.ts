import { HookCatalogEntry } from '../hook-catalog.types';
import { LEAD_ACCEPT_ENTRY } from './lead-accept.entry';
import { LEAD_CLIENT_ENTRY } from './lead-client.entry';
import { DUPLICATE_CHECK_ENTRY } from './duplicate-check.entry';
import { LEAD_INTAKE_RESCUE_ENTRY } from './lead-intake-rescue.entry';
import { LEAD_REQUEST_SLA_ENTRY } from './lead-request-sla.entry';

/**
 * Семейство «путь заявки»: принятие, клиент из лида, проверка дублей на
 * входе, страховка входа, SLA принятия. Записи добавляются сюда.
 */
export const LEAD_REQUEST_FAMILY_ENTRIES: HookCatalogEntry[] = [
    LEAD_ACCEPT_ENTRY,
    LEAD_CLIENT_ENTRY,
    DUPLICATE_CHECK_ENTRY,
    LEAD_INTAKE_RESCUE_ENTRY,
    LEAD_REQUEST_SLA_ENTRY,
];
