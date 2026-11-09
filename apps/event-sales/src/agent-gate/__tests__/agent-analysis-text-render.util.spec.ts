import type { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import type { AgentSectionAnalysisDto } from '../dto/agent-analysis-request/agent-section-analysis.dto';
import {
    renderAnalysisDuplicateComment,
    renderSectionComment,
} from '../services/agent-analysis-text-render.util';

/**
 * Комментарии таймлайна из разбора: раздел без оценки (этап не прозвучал,
 * агент прислал null) печатается без «null/10» — замечание владельца
 * 09.11.2026; оценка-число остаётся в заголовке.
 */
const section = (
    over: Partial<Record<keyof AgentSectionAnalysisDto, unknown>> = {},
): AgentSectionAnalysisDto =>
    ({
        section: 'REFUSAL',
        relevance: 60,
        score: 7,
        asWas: 'Клиент сам инициировал вопрос о счёте.',
        alternatives: ['«Ирина, я уважаю вашу конфиденциальность…»'],
        ...over,
    }) as unknown as AgentSectionAnalysisDto;

describe('renderSectionComment', () => {
    it('оценка-число — в заголовке «— 7/10»', () => {
        const text = renderSectionComment(section());

        expect(text).not.toBeNull();
        expect(text?.split('\n')[0]).toMatch(/^\[b\].+\[\/b\] — 7\/10$/);
        expect(text).toContain('[b]Как было:[/b]');
    });

    it('оценки нет (null или не задана) — заголовок без «/10», никакого «null»', () => {
        for (const score of [null, undefined]) {
            const text = renderSectionComment(section({ score }));

            expect(text).not.toBeNull();
            expect(text?.split('\n')[0]).toMatch(/^\[b\].+\[\/b\]$/);
            expect(text).not.toContain('null');
            expect(text).not.toContain('/10');
        }
    });
});

describe('renderAnalysisDuplicateComment', () => {
    it('раздел и общая оценка без числа печатаются прочерком, а не «null/10»', () => {
        const dto = {
            callType: 'presentation',
            summary: 'Резюме разговора.',
            score: null,
            sections: [section({ score: null }), section({ score: 8 })],
        } as unknown as AgentCallAnalysisDto;

        const text = renderAnalysisDuplicateComment('77', dto);

        expect(text).not.toContain('null');
        expect(text).not.toContain('[b]Оценка:[/b]');
        expect(text).toContain(': — (актуальность 60%)');
        expect(text).toContain(': 8/10 (актуальность 60%)');
    });
});
