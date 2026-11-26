import type { AnalyticsLiteReportFacts } from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import { isConnectionLostReported } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/call-report-connection-lost.util';
import type { AgentCallAnalysisContentDto } from '../dto/agent-analysis-request/agent-call-analysis-content.dto';
import { AgentIssueDto } from '../dto/agent-analysis-request/agent-report-facts.dto';

/**
 * «В разборе отмечен обрыв связи» принимает и лёгкую проекцию разбора
 * (AnalyticsLiteReportFacts), и DTO разбора из agent-gate БЕЗ приведений
 * типов: если форма сбоя или исхода разойдётся — тест не скомпилируется.
 */
describe('isConnectionLostReported: формы разбора из call-lib и agent-gate', () => {
    const lite = (
        overrides: Partial<AnalyticsLiteReportFacts>,
    ): AnalyticsLiteReportFacts => ({
        outcome: null,
        issues: [],
        prices: [],
        upsellAttempted: null,
        upsellKind: null,
        selfIntro: null,
        ...overrides,
    });

    const issue = (code: AgentIssueDto['code']): AgentIssueDto =>
        Object.assign(new AgentIssueDto(), { code, quote: 'цитата' });

    it('лёгкая проекция разбора: исход и сбой', () => {
        expect(
            isConnectionLostReported(lite({ outcome: 'connection_lost' })),
        ).toBe(true);
        expect(
            isConnectionLostReported(
                lite({ issues: [{ code: 'connection_lost', quote: null }] }),
            ),
        ).toBe(true);
        expect(isConnectionLostReported(lite({ outcome: 'refused' }))).toBe(
            false,
        );
    });

    it('DTO разбора: исход и сбой', () => {
        const byOutcome: Pick<
            AgentCallAnalysisContentDto,
            'outcome' | 'issues'
        > = { outcome: 'connection_lost' };
        const byIssue: Pick<AgentCallAnalysisContentDto, 'outcome' | 'issues'> =
            {
                outcome: 'postponed',
                issues: [issue('telephony'), issue('connection_lost')],
            };
        const neither: Pick<AgentCallAnalysisContentDto, 'outcome' | 'issues'> =
            {
                outcome: null,
                issues: [issue('telephony')],
            };
        expect(isConnectionLostReported(byOutcome)).toBe(true);
        expect(isConnectionLostReported(byIssue)).toBe(true);
        expect(isConnectionLostReported(neither)).toBe(false);
    });
});
