import {
    describeLlmCallFailure,
    describeLlmCallSuccess,
} from '../llm-call-log.util';
import type { StructuredLlmResponse } from '../structured-llm.types';

/** Системный промпт 7 знаков + контент 12 знаков = вход 19 знаков. */
const REQUEST = {
    domain: 'test.bitrix24.ru',
    systemPrompt: 'система',
    userContent: 'текст звонка',
    schemaName: 'call_focus_form',
};

type LoggedAnswer = Pick<StructuredLlmResponse, 'usage' | 'queueMs'>;

const answer = (over: Partial<LoggedAnswer> = {}): LoggedAnswer => ({
    usage: { promptTokens: 5120, completionTokens: 860, totalTokens: 5980 },
    ...over,
});

/** Строка удачного вызова VibeCode для тестового запроса. */
function successLine(response: LoggedAnswer, elapsedMs: number): string {
    return describeLlmCallSuccess(REQUEST, 'vibecode', response, elapsedMs);
}

describe('llm-call-log.util — строки журнала вызова модели', () => {
    it('удачный вызов: провайдер, схема, домен, мс ответа, вход в знаках и токены', () => {
        expect(successLine(answer(), 41_280)).toBe(
            'LLM vibecode call_focus_form (test.bitrix24.ru): ответ за 41280 мс, ' +
                'вход 19 знаков, токены промпта 5120, ответа 860',
        );
    });

    it('провайдер не вернул токены — «нет», а не ноль', () => {
        const usage = {
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
        };

        expect(successLine(answer({ usage }), 900)).toContain(
            'токены промпта нет, ответа нет',
        );
    });

    it('адаптер ждал слота — ожидание отдельно, время ответа без него', () => {
        expect(successLine(answer({ queueMs: 12_000 }), 53_280)).toContain(
            'ответ за 41280 мс, ждал слота 12000 мс, вход 19 знаков',
        );
    });

    it('слота не ждал (0 или поле не задано) — про ожидание ни слова', () => {
        expect(successLine(answer({ queueMs: 0 }), 1_000)).not.toContain(
            'ждал слота',
        );
        expect(successLine(answer(), 1_000)).not.toContain('ждал слота');
    });

    it('миллисекунды целые и не отрицательные: дробный замер, сдвиг часов', () => {
        expect(successLine(answer(), 1_234.6)).toContain('ответ за 1235 мс');
        expect(successLine(answer(), -5)).toContain('ответ за 0 мс');
    });

    it('сбой: прежнее предупреждение шлюза плюс «через N мс»', () => {
        const line = describeLlmCallFailure(
            REQUEST,
            'vibecode',
            'Vibecode call_focus_form timeout after 180000 ms',
            180_012,
        );

        expect(line).toBe(
            'Провайдер LLM vibecode не ответил на call_focus_form (test.bitrix24.ru) ' +
                'через 180012 мс: Vibecode call_focus_form timeout after 180000 ms',
        );
    });

    it('сбой после ожидания слота: «через» — только молчание поставщика, ожидание в скобках', () => {
        const line = describeLlmCallFailure(
            REQUEST,
            'vibecode',
            'Vibecode call_focus_form timeout after 180000 ms',
            210_012,
            30_000,
        );

        expect(line).toBe(
            'Провайдер LLM vibecode не ответил на call_focus_form (test.bitrix24.ru) ' +
                'через 180012 мс (ждал слота 30000 мс): Vibecode call_focus_form timeout after 180000 ms',
        );
    });
});
