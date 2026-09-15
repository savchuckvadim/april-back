import { Logger } from '@nestjs/common';
import type { BitrixService } from '@lib/bitrix';
import type { MonthSegment } from '../../../shared/lib/month-segments.util';
import type { StyleCrmLead } from './style-crm.types';

/** Поля лида, нужные скорости ответа (ось 7, под-ось «лиды»). */
const LEAD_SELECT = ['ID', 'DATE_CREATE', 'ASSIGNED_BY_ID'] as const;

/** Строка ответа `crm.lead.list` в нужной проекции. */
interface BxLeadRow {
    ID?: string | number;
    DATE_CREATE?: string;
    ASSIGNED_BY_ID?: string | number;
}

/** Потолок страниц (50 строк на страницу) — защита от разноса пагинации. */
const MAX_PAGES = 80;

/**
 * Лиды сегмента для скорости ответа на лид: `crm.lead.list` по дате
 * создания и ответственным. НЕ `@Injectable` — создаётся под конкретный
 * инстанс битрикса (`new StyleCrmLeadsService(bitrix)`), чтобы в сервисе
 * не оседало состояние домена.
 */
export class StyleCrmLeadsService {
    private readonly logger = new Logger(StyleCrmLeadsService.name);

    constructor(private readonly bitrix: BitrixService) {}

    async load(
        segment: MonthSegment,
        managerIds: readonly number[],
    ): Promise<StyleCrmLead[]> {
        if (managerIds.length === 0) return [];
        const leads: StyleCrmLead[] = [];
        let start = 0;
        for (let page = 0; page < MAX_PAGES; page += 1) {
            const response = (await this.bitrix.api.call('crm.lead.list', {
                filter: {
                    '>=DATE_CREATE': `${segment.from}T00:00:00`,
                    '<=DATE_CREATE': `${segment.to}T23:59:59`,
                    ASSIGNED_BY_ID: managerIds.map(String),
                },
                select: [...LEAD_SELECT],
                order: { ID: 'ASC' },
                start,
            })) as { result?: BxLeadRow[]; next?: number } | null;

            if (!response || !('result' in response)) {
                this.logger.warn(
                    `crm.lead.list: страница со смещения ${start} без result — ` +
                        'скорость ответа на лид посчитана не по всем лидам',
                );
                break;
            }
            leads.push(...(response.result ?? []).flatMap(toLead));
            if (response.next === undefined) break;
            start = response.next;
        }
        return leads;
    }
}

/** Строка Битрикса → лид счётчиков; без id/даты/ответственного — мимо. */
function toLead(row: BxLeadRow): StyleCrmLead[] {
    const id = String(row.ID ?? '');
    const managerId = String(row.ASSIGNED_BY_ID ?? '');
    const createdAt = String(row.DATE_CREATE ?? '');
    return id && managerId && createdAt ? [{ id, managerId, createdAt }] : [];
}
