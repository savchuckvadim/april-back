import {
    AI_ANALYTICS_BUCKETS,
    AI_ANALYTICS_EVENT_KINDS,
    AI_ANALYTICS_TONES,
    AI_ANALYTICS_UNMAPPED_KPI_EVENT_TYPES,
    AiAnalyticsEventKind,
    CALL_REPORT_CALL_TYPE_CODES,
    CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { PBX_DEAL_SALES_BASE_STAGES } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { findPbxSalesKpiListField } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list-field.type';
import { resolveCallTypePrior } from '../services/call-type-prior.util';

/**
 * Согласованность карты трёх алфавитов (portal-lib) с приором типа звонка
 * (event-sales): карта обязана покрывать все AI-типы, а стадии в ней —
 * давать у приора тот же тип. Иначе витрина AI-аналитики покажет один
 * этап, а классификатор разбора будет ждать другой.
 */

const priorOfStage = (dealStageCode: string) =>
    resolveCallTypePrior({
        entityType: 'deal',
        dealCategoryCode: 'sales_base',
        dealStageCode,
        leadWorkKind: null,
    });

const kinds: readonly (readonly [
    CallReportCallTypeCode,
    AiAnalyticsEventKind,
])[] = CALL_REPORT_CALL_TYPE_CODES.map(
    code => [code, AI_ANALYTICS_EVENT_KINDS[code]] as const,
);

describe('AI_ANALYTICS_EVENT_KINDS — карта трёх алфавитов (план §2.1)', () => {
    it('покрывает все CALL_REPORT_CALL_TYPE_CODES и ничего лишнего', () => {
        expect(Object.keys(AI_ANALYTICS_EVENT_KINDS).sort()).toEqual(
            [...CALL_REPORT_CALL_TYPE_CODES].sort(),
        );
    });

    it('каждая стадия карты даёт у приора тот же тип звонка', () => {
        for (const [callType, kind] of kinds) {
            for (const stage of kind.stagePriorCodes) {
                expect(
                    `${stage}→${priorOfStage(stage)?.callType ?? 'null'}`,
                ).toBe(`${stage}→${callType}`);
            }
        }
    });

    it('стадия основной воронки, известная приору, есть ровно в одном типе; неизвестная — ни в одном', () => {
        for (const { code } of PBX_DEAL_SALES_BASE_STAGES) {
            const owners = kinds
                .filter(([, kind]) => kind.stagePriorCodes.includes(code))
                .map(([callType]) => callType);
            expect(`${code}:${owners.join(',')}`).toBe(
                `${code}:${priorOfStage(code)?.callType ?? ''}`,
            );
        }
    });

    it('site_lead: приор — лид из заявки с сайта, стадий сделки нет', () => {
        expect(AI_ANALYTICS_EVENT_KINDS.site_lead.stagePriorCodes).toEqual([]);
        expect(
            resolveCallTypePrior({
                entityType: 'lead',
                dealCategoryCode: null,
                dealStageCode: null,
                leadWorkKind: 'request',
            })?.callType,
        ).toBe('site_lead');
    });

    it('KPI-код принадлежит не более чем одному типу — факт не считается дважды', () => {
        const codes = kinds.flatMap(([, kind]) => kind.kpiEventTypeCodes);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('карта вместе со списком «вне карты» покрывает все item-ы event_type без пересечений', () => {
        const all =
            findPbxSalesKpiListField('event_type')?.items.map(
                item => item.code,
            ) ?? [];
        const mapped = kinds.flatMap(([, kind]) => kind.kpiEventTypeCodes);
        const unmapped = Object.keys(AI_ANALYTICS_UNMAPPED_KPI_EVENT_TYPES);

        expect([...mapped, ...unmapped].sort()).toEqual([...all].sort());
        expect(mapped.filter(code => unmapped.includes(code))).toEqual([]);
    });

    it('главный KPI-код входит в коды типа; тип без KPI объясняет причину', () => {
        for (const [callType, kind] of kinds) {
            const hasKpi = kind.kpiEventTypeCodes.length > 0;
            const primaryInCodes =
                kind.kpiPrimaryEventTypeCode !== null &&
                kind.kpiEventTypeCodes.includes(kind.kpiPrimaryEventTypeCode);
            expect(`${callType}:${primaryInCodes}`).toBe(
                `${callType}:${hasKpi}`,
            );
            expect(`${callType}:${kind.kpiReason !== null}`).toBe(
                `${callType}:${!hasKpi}`,
            );
        }
    });

    it('доработка — без KPI-факта с причиной refine-mapped-to-call', () => {
        expect(AI_ANALYTICS_EVENT_KINDS.refine.kpiReason).toBe(
            'refine-mapped-to-call',
        );
        expect(AI_ANALYTICS_UNMAPPED_KPI_EVENT_TYPES.refine).toBeDefined();
    });

    it('корзины оценок (§2.2): контакт, презентация, закрытие; other/irrelevant — вне оценок', () => {
        const byBucket = (bucket: AiAnalyticsEventKind['bucket']) =>
            kinds
                .filter(([, kind]) => kind.bucket === bucket)
                .map(([callType]) => callType)
                .sort();
        expect(byBucket('contact')).toEqual(['call', 'cold', 'site_lead']);
        expect(byBucket('presentation')).toEqual(['presentation']);
        expect(byBucket('closing')).toEqual(['decision', 'payment', 'refine']);
        expect(byBucket(null)).toEqual(['irrelevant', 'other']);
    });

    it('тон и корзина — из реестров, подпись непустая', () => {
        for (const [callType, kind] of kinds) {
            expect(
                `${callType}:${AI_ANALYTICS_TONES.includes(kind.tone)}`,
            ).toBe(`${callType}:true`);
            expect(
                `${callType}:${kind.bucket === null || AI_ANALYTICS_BUCKETS.includes(kind.bucket)}`,
            ).toBe(`${callType}:true`);
            expect(`${callType}:${kind.title.length > 0}`).toBe(
                `${callType}:true`,
            );
        }
    });
});
