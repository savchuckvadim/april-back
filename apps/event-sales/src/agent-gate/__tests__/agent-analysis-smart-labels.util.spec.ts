import { CALL_REPORT_OBJECTION_REACTIONS } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    agentNameTitle,
    agentVersionTitle,
    OBJECTION_REACTION_TITLES,
    objectionHandlingText,
} from '../services/agent-analysis-smart-labels.util';

/**
 * Английские коды в карточке «AI-анализ звонков» (владелец, 10.11.2026):
 * в Битрикс уходят русские подписи, коды остаются только в записи разбора.
 */
describe('подписи карточки «AI-анализ звонков»', () => {
    it('у каждой реакции на возражение есть русская подпись', () => {
        for (const reaction of CALL_REPORT_OBJECTION_REACTIONS) {
            expect(OBJECTION_REACTION_TITLES[reaction]).toMatch(/[а-яё]/);
        }
    });

    it('«как отработал»: код реакции → подпись, обычный текст — как есть', () => {
        expect(objectionHandlingText('clarify')).toBe('уточнил вопросом');
        expect(objectionHandlingText(' other ')).toBe(
            'иное или не отреагировал',
        );
        expect(objectionHandlingText('Предложил демо-доступ')).toBe(
            'Предложил демо-доступ',
        );
    });

    it('имя агента: свои — по-русски, внешний — как назвался', () => {
        expect(agentNameTitle('call-report-analyzer')).toBe(
            'April: разбор звонка',
        );
        expect(agentNameTitle('call-report-reanalyzer')).toBe(
            'April: переразбор',
        );
        expect(agentNameTitle('openclaw-gsr')).toBe('openclaw-gsr');
        expect(agentNameTitle(undefined)).toBeUndefined();
    });

    it('версия: internal-focus-vN → «многослойный разбор, версия N»', () => {
        expect(agentVersionTitle('internal-focus-v2')).toBe(
            'многослойный разбор, версия 2',
        );
        expect(agentVersionTitle('skill-1.4')).toBe('skill-1.4');
        expect(agentVersionTitle(undefined)).toBeUndefined();
    });
});
