import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { crmCardUrl } from '@lib/bitrix/consts/timeline.consts';
import { ETimeZone } from '@lib/shared/lib/date';
import {
    ClassifiedClient,
    ClassifiedDeal,
    DuplicateLead,
} from '../types/duplicate-report.types';
import { ExcelCellValue } from './duplicate-excel.table';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Всё, что нужно колонкам помимо строки: ссылки, TZ дат, имена. */
export interface DuplicateExcelContext {
    readonly domain: string;
    readonly timezone: ETimeZone;
    readonly userNames: ReadonlyMap<number, string>;
}

/**
 * Момент → дата Excel. Excel про часовые пояса не знает и показывает дату
 * как есть, поэтому кладём КАЛЕНДАРНЫЙ ДЕНЬ ПОРТАЛА (полночь UTC): сделка,
 * созданная в 01:00 по Москве, не уезжает на вчера.
 */
export const excelDate = (ms: number | null, tz: ETimeZone): Date | null => {
    if (ms === null) return null;
    const local = dayjs(ms).tz(tz);
    return new Date(Date.UTC(local.year(), local.month(), local.date()));
};

export const yes = (flag: boolean): string => (flag ? 'да' : '');

export const dealLink = (
    ctx: DuplicateExcelContext,
    id: number,
): ExcelCellValue => ({
    text: String(id),
    hyperlink: crmCardUrl(ctx.domain, 'deal', id),
});

export const clientLink = (
    ctx: DuplicateExcelContext,
    client: ClassifiedClient,
): ExcelCellValue => ({
    text: client.title,
    hyperlink: crmCardUrl(ctx.domain, client.ref.kind, client.ref.id),
});

/** Лид-источник ссылкой; лид удалён — всё равно ссылка по id из сделки. */
export const leadLink = (
    ctx: DuplicateExcelContext,
    item: ClassifiedDeal,
): ExcelCellValue => {
    const id = item.deal.lead?.id ?? item.deal.sourceLeadId;
    return id
        ? { text: String(id), hyperlink: crmCardUrl(ctx.domain, 'lead', id) }
        : null;
};

/**
 * «Откуда» сделки клиента: источник и дата лида каждой сделки, у которой
 * он есть («Заявка с веб-сайта 12.09.26; База Актион 01.03.26»).
 */
export const leadOriginsText = (
    client: ClassifiedClient,
    tz: ETimeZone,
): string | null =>
    client.deals
        .map(item => item.deal.lead)
        .filter((lead): lead is DuplicateLead => lead !== null)
        .map(lead =>
            [
                lead.sourceName || 'без источника',
                lead.createdAt !== null
                    ? dayjs(lead.createdAt).tz(tz).format('DD.MM.YY')
                    : '',
            ]
                .filter(Boolean)
                .join(' '),
        )
        .join('; ') || null;

/** «База Актион Белгород · заявка»; ничего не известно — пусто. */
export const leadSource = (lead: DuplicateLead | null): string | null =>
    [lead?.sourceName ?? '', lead?.isRequest ? 'заявка' : '']
        .filter(Boolean)
        .join(' · ') || null;
