import type { IsoDate } from '../../shared/lib/month-segments.util';
import type {
    KpiDigestPresentationDto,
    KpiDigestSaleDto,
} from '../dto/digest-presentations.dto';

/**
 * Партиция «презентации и продажи дня» по всему порталу: сделки «ОП
 * Презентации», попавшие в день, и выигранные в этот день сделки «ОП
 * Основная». Комментарии из списка KPI подставляет сборка.
 */
export interface DigestPresentationsPartition {
    date: IsoDate;
    items: KpiDigestPresentationDto[];
    sales: KpiDigestSaleDto[];
    truncated: boolean;
    /** Некритичные проблемы (воронка не настроена и т.п.). */
    warnings: string[];
    builtAt: string;
}
