import {
    AuditReport,
    buildAuditReport,
} from '../../audit/ai-analytics-audit.report';

/** Валидный пустой отчёт аудита для тестов стора/сервиса/контроллера. */
export function auditReportFixture(
    domain: string,
    generatedAt = '2026-09-06',
    months: string[] = [
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
    ],
): AuditReport {
    return buildAuditReport(
        { rows: [], depth: [], fetchedTranscriptions: 0, outsideWindow: 0 },
        { domain, timeZone: 'Europe/Moscow', months, generatedAt },
    );
}
