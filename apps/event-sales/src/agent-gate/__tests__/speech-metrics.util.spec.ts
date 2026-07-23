import { computeSpeechMetrics } from '../services/speech-metrics.util';
import { AgentDialogTurnDto } from '../dto/agent-analysis-request.dto';

const turn = (role: AgentDialogTurnDto['role'], text: string) =>
    ({ role, text }) as AgentDialogTurnDto;

describe('computeSpeechMetrics', () => {
    it('считает долю речи менеджера и число его вопросов', () => {
        const metrics = computeSpeechMetrics([
            turn('manager', 'Добрый день компания Гарант чем пользуетесь?'), // 6 слов, 1 вопрос
            turn('client', 'У нас Консультант'), // 3 слова
            turn('manager', 'А почему выбрали его? Что нравится?'), // 6 слов, 2 вопроса
        ]);
        expect(metrics).toEqual({
            talkRatioPct: 80, // 12 из 15 слов
            questionsCount: 3,
        });
    });

    it('реплики роли other не входят в долю речи', () => {
        const metrics = computeSpeechMetrics([
            turn('other', 'Оставьте сообщение после сигнала?'),
            turn('manager', 'один два'),
            turn('client', 'три четыре'),
        ]);
        expect(metrics).toEqual({ talkRatioPct: 50, questionsCount: 0 });
    });

    it('вопросы клиента не считаются', () => {
        const metrics = computeSpeechMetrics([
            turn('manager', 'слово'),
            turn('client', 'А сколько стоит? А зачем?'),
        ]);
        expect(metrics?.questionsCount).toBe(0);
    });

    it('пустой или отсутствующий диалог → null', () => {
        expect(computeSpeechMetrics(undefined)).toBeNull();
        expect(computeSpeechMetrics([])).toBeNull();
    });

    it('диалог без слов менеджера/клиента → null', () => {
        expect(computeSpeechMetrics([turn('other', 'гудки')])).toBeNull();
    });
});
