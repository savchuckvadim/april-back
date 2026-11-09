import type { OwnerReportPeriodKind } from '@lib/sales-ai-analytics';
import type { AiOwnerReportDto } from '../dto/ai-owner-report.dto';
import type { AiAnalyticsSnapshotRecord } from '../store/ai-analytics-snapshot.store';
import { AI_OWNER_REPORT_PAYLOAD_VERSION } from './owner-report.const';
import type { OwnerReportSnapshotPayload } from './owner-report.types';

/**
 * Нагрузка снапшота → DTO ответа: текст как есть, id разборов-примеров →
 * ссылки на карточки, источник текста по принятым частям модели.
 */
export function toOwnerReportDto(
    payload: OwnerReportSnapshotPayload,
    availablePeriods: readonly string[],
): AiOwnerReportDto {
    const linksOf = (ids: readonly string[]): string[] =>
        ids.flatMap(id => {
            const link = payload.links[id];
            return link ? [link] : [];
        });
    const { text } = payload;
    return {
        kind: payload.kind,
        periodKey: payload.periodKey,
        from: payload.from,
        to: payload.to,
        generatedAt: payload.generatedAt,
        source: payload.narrative.accepted > 0 ? 'model' : 'template',
        narrativeReason: payload.narrative.reason,
        text: {
            title: text.title,
            periodLabel: text.periodLabel,
            tiles: text.tiles,
            attention: text.attention,
            summary: text.summary,
            summarySource: text.summarySource,
            overview: text.overview,
            funnel: text.funnel,
            crmFunnel: text.crmFunnel,
            presentations: text.presentations,
            leaks: text.leaks.map(leak => ({
                code: leak.code,
                title: leak.title,
                scale: leak.scale,
                money: leak.money,
                nature: leak.nature,
                action: leak.action,
                text: leak.text,
                source: leak.source,
                exampleLinks: linksOf(leak.examples),
            })),
            management: text.management,
            objections: text.objections,
            issues: {
                intro: text.issues.intro,
                rows: text.issues.rows.map(row => ({
                    label: row.label,
                    calls: row.calls,
                    exampleLinks: linksOf(row.examples),
                })),
            },
            controlMetrics: text.controlMetrics,
            managers: text.managers.map(manager => ({
                managerId: manager.managerId,
                name: manager.name,
                headline: manager.headline,
                cells: manager.cells,
                strengths: manager.strengths,
                risks: manager.risks,
                conclusion: manager.conclusion,
                source: manager.source,
            })),
            methodology: text.methodology,
            glossary: text.glossary,
        },
        availablePeriods: [...availablePeriods],
    };
}

/** Нагрузка снапшота нашей версии; чужая форма — null. */
export function ownerReportPayloadOf(
    record: Pick<AiAnalyticsSnapshotRecord, 'payload'>,
): OwnerReportSnapshotPayload | null {
    const payload =
        record.payload as Partial<OwnerReportSnapshotPayload> | null;
    if (
        !payload ||
        payload.version !== AI_OWNER_REPORT_PAYLOAD_VERSION ||
        typeof payload.periodKey !== 'string' ||
        typeof payload.kind !== 'string' ||
        !payload.text ||
        !payload.facts ||
        !payload.narrative
    ) {
        return null;
    }
    return payload as OwnerReportSnapshotPayload;
}

/** Ключи периодов вида kind среди снапшотов, новые первыми, без повторов. */
export function availablePeriodKeys(
    records: readonly Pick<AiAnalyticsSnapshotRecord, 'payload'>[],
    kind: OwnerReportPeriodKind,
): string[] {
    const keys = new Set<string>();
    for (const record of records) {
        const payload = ownerReportPayloadOf(record);
        if (payload && payload.kind === kind) keys.add(payload.periodKey);
    }
    return [...keys].sort((a, b) => b.localeCompare(a));
}
