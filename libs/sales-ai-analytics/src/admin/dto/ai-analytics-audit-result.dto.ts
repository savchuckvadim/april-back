import { ApiProperty } from '@nestjs/swagger';
import { AiAnalyticsAuditAbout } from '../../audit/ai-analytics-audit.about';
import { AiAnalyticsAuditAboutDto } from './ai-analytics-audit-about.dto';
import { AuditReport } from '../../audit/ai-analytics-audit.report';
import {
    AI_ANALYTICS_AUDIT_SOURCES,
    AiAnalyticsAuditSource,
} from '../../contracts/audit-snapshot.types';

/**
 * Результат аудита — свежий расчёт (fromSnapshot = false) или последний
 * снапшот из ais (fromSnapshot = true). Форма одна, чтобы фронт админки
 * рисовал оба случая одним компонентом.
 */
export class AiAnalyticsAuditResultDto {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'april.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description: 'Момент формирования отчёта, ISO (UTC).',
        example: '2026-09-06T04:10:00.000Z',
    })
    generatedAt: string;

    @ApiProperty({
        description: 'Сколько месяцев запрошено (окно — в report.meta.months).',
        example: 6,
    })
    months: number;

    @ApiProperty({
        description: 'Часовой пояс расчёта (IANA).',
        example: 'Europe/Moscow',
    })
    timeZone: string;

    @ApiProperty({
        description:
            'true — отдан последний снапшот из ais; false — посчитано сейчас по живой БД.',
        example: false,
    })
    fromSnapshot: boolean;

    @ApiProperty({
        description:
            'Кто сформировал отчёт: admin — ручка, cron — месячный снапшот.',
        enum: AI_ANALYTICS_AUDIT_SOURCES,
        example: 'admin',
    })
    source: AiAnalyticsAuditSource;

    @ApiProperty({
        description:
            'Отчёт в markdown: разделы 1–8 (покрытие user_id, разборы по ' +
            'ячейкам, шум other/irrelevant, длительности, версии, поля ' +
            'user_result, глубина ais, рекомендация по порогам).',
        type: String,
    })
    markdown: string;

    @ApiProperty({
        description:
            'Структурированный отчёт (AuditReport из @lib/sales-ai-analytics): ' +
            'meta, rules, totals, coverage, pivots, noise, duration, versions, ' +
            'fields, depth, recommendation.',
        type: Object,
    })
    report: AuditReport;

    @ApiProperty({
        description:
            'Самоописание аудита: что считалось, откуда данные, как читать ' +
            'разделы и рекомендацию — тот же текст, что в Swagger и README.',
        type: AiAnalyticsAuditAboutDto,
    })
    about: AiAnalyticsAuditAbout;
}
