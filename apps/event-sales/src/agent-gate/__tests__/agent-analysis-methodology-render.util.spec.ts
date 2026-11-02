import type { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import {
    renderCapsComment,
    renderMethodologyCheckpointComments,
    renderMethodologyCheckpointsComment,
} from '../services/agent-analysis-methodology-render.util';

const dto = (over: Partial<AgentCallAnalysisDto> = {}): AgentCallAnalysisDto =>
    ({
        summary: 'итог',
        needsFound: true,
        presentationDone: true,
        callType: 'presentation',
        ...over,
    }) as AgentCallAnalysisDto;

/**
 * Записи таймлайна по методике: пункты со статусами, цитатами и таймкодами,
 * спирали, ограничители только срезавшие оценку; без методики и без срезов —
 * записей нет.
 */
describe('agent-analysis-methodology-render.util', () => {
    it('пункты: заголовок с долей, ✓ с цитатой и таймкодом, ✗ пропущено, – не применимо, спирали', () => {
        const comment = renderMethodologyCheckpointsComment(
            dto({
                methodology: {
                    code: 'polyansky',
                    version: '1.0.0',
                    title: 'Полянский',
                    checkpointsDone: 1,
                    checkpointsTotal: 2,
                    spirals: [
                        {
                            need: 'а',
                            feature: 'б',
                            link: 'в',
                            benefit: 'г',
                            question: 'д',
                            clientAnswer: null,
                            full: true,
                        },
                        {
                            need: null,
                            feature: 'б',
                            link: null,
                            benefit: null,
                            question: null,
                            clientAnswer: null,
                            full: false,
                        },
                    ],
                    spiralsFull: 1,
                    spiralsMinFull: 3,
                    checkpoints: [
                        {
                            code: 'pres.needs_confirmed',
                            title: 'Резюмировал потребности вслух',
                            status: 'done',
                            mandatory: true,
                            source: 'model',
                            quote: 'Итак, вам важно…',
                            startSec: 125,
                            endSec: 131,
                        },
                        {
                            code: 'pres.summary_by_needs',
                            title: 'Резюмировал показ через потребности',
                            status: 'missed',
                            mandatory: true,
                            source: 'model',
                            quote: null,
                            startSec: null,
                            endSec: null,
                        },
                        {
                            code: 'pres.kit_12m',
                            title: 'Предложил лицензию на 12 месяцев',
                            status: 'not_applicable',
                            mandatory: false,
                            source: 'model',
                            quote: null,
                            startSec: null,
                            endSec: null,
                        },
                    ],
                },
            }),
        );
        expect(comment).toContain(
            '📋 [b]Методика «Полянский»: пунктов выполнено 1 из 2[/b]',
        );
        expect(comment).toContain(
            '✓ Резюмировал потребности вслух — «Итак, вам важно…» (02:05)',
        );
        expect(comment).toContain(
            '✗ Резюмировал показ через потребности — пропущено',
        );
        expect(comment).toContain(
            '– Предложил лицензию на 12 месяцев (по желанию) — не применимо к этому разговору',
        );
        expect(comment).toContain('полных 1 из 2');
        expect(comment).not.toMatch(/pres\./);
    });

    it('ограничители: только срезавшие оценку, с названием раздела, до → после и потолком', () => {
        const comment = renderCapsComment(
            dto({
                capsTriggered: [
                    {
                        code: 'core.presentation_without_needs',
                        title: 'презентация без выявленных потребностей',
                        target: 'PRESENTATION',
                        max: 6,
                        before: 9,
                        after: 6,
                        applied: true,
                    },
                    {
                        code: 'cold.no_diagnostics',
                        title: 'холодный: не провёл диагностику',
                        target: 'total',
                        max: 7,
                        before: 8,
                        after: 7,
                        applied: true,
                    },
                    {
                        code: 'core.info_promise_without_date',
                        title: 'финал без даты',
                        target: 'CLOSING',
                        max: 5,
                        before: 4,
                        after: 4,
                        applied: false,
                    },
                ],
            }),
        );
        expect(comment).toContain('⛔ [b]Оценка ограничена[/b]');
        expect(comment).toContain(
            '• презентация без выявленных потребностей: Презентация под потребности 9 → 6 (потолок 6)',
        );
        expect(comment).toContain(
            '• холодный: не провёл диагностику: Итоговая оценка 8 → 7 (потолок 7)',
        );
        expect(comment).not.toContain('финал без даты');
    });

    it('без методики и без срезов — записей нет; порядок: пункты, затем ограничители', () => {
        expect(renderMethodologyCheckpointComments(dto())).toEqual([]);
        expect(renderCapsComment(dto({ capsTriggered: [] }))).toBeNull();
        const both = renderMethodologyCheckpointComments(
            dto({
                methodology: {
                    code: 'polyansky',
                    version: '1.0.0',
                    title: 'Полянский',
                    checkpointsDone: 0,
                    checkpointsTotal: 1,
                    spirals: null,
                    spiralsFull: null,
                    spiralsMinFull: null,
                    checkpoints: [
                        {
                            code: 'cold.no_price',
                            title: 'Не обсуждал стоимость до презентации',
                            status: 'missed',
                            mandatory: true,
                            source: 'model',
                            quote: 'сколько стоит — тысяч сорок',
                            startSec: 60,
                            endSec: 65,
                        },
                    ],
                },
                capsTriggered: [
                    {
                        code: 'cold.price_before_presentation',
                        title: 'холодный: обсуждал стоимость до показа',
                        target: 'PRICE',
                        max: 6,
                        before: 8,
                        after: 6,
                        applied: true,
                    },
                ],
            }),
        );
        expect(both).toHaveLength(2);
        expect(both[0]).toContain('📋');
        expect(both[0]).toContain(
            '✗ Не обсуждал стоимость до презентации — «сколько стоит — тысяч сорок» (01:00)',
        );
        expect(both[0]).not.toContain('Спирали');
        expect(both[1]).toContain('⛔');
    });
});
