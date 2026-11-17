import { Logger } from '@nestjs/common';
import type { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import { tidyChecklistTexts } from '../services/agent-analysis-checklist.util';
import { prepareAgentAnalysis } from '../services/agent-analysis-prepare.util';

/**
 * Запись словаря в разборах хвоста и 5К (17.11.2026): общий шаг подготовки
 * разбора к записи (приём, фокус-разбор, переразбор, починка, перезапись)
 * сохраняет читаемые строки по блокам анкеты — в базу, карточку Битрикс24 и
 * ленту уходит уже чистый текст.
 */
const dto = (patch: Partial<AgentCallAnalysisDto>): AgentCallAnalysisDto =>
    ({
        callType: 'presentation',
        summary: 'итог',
        needsFound: true,
        presentationDone: true,
        ...patch,
    }) as AgentCallAnalysisDto;

function makeLogger() {
    const warn = jest.fn<void, [string]>();
    const log = jest.fn<void, [string]>();
    return { logger: { warn, log } as unknown as Logger, warn, log };
}

const FIVE_K_RECORD =
    "{'client': 'Экономист, считает бюджет;', 'company': 'не выяснено;', " +
    "'colleagues': None, 'competitor': 'другая система ;', 'criteria': 'цена;'}";

describe('разбор чек-листов при записи: запись словаря → строки', () => {
    it('сборка разбора сохраняет нормализованный текст 5К и хвоста', () => {
        const { logger } = makeLogger();
        const result = prepareAgentAnalysis(
            't-1',
            'agent',
            dto({
                fiveKDone: false,
                fiveKAnalysis: FIVE_K_RECORD,
                hvostDone: false,
                hvostAnalysis: "{'desire': 'интересно;', 'decisionWay': None}",
            }),
            null,
            logger,
        );
        expect(result.fiveKAnalysis).toBe(
            [
                'Клиент: Экономист, считает бюджет',
                'Компания: не выяснено',
                'Коллеги: не выяснено',
                'Конкурент: другая система',
                'Критерии выбора: цена',
            ].join('\n'),
        );
        expect(result.hvostAnalysis).toBe(
            [
                'Желание работать с Гарантом: интересно',
                'Выход на решение: не выяснено',
            ].join('\n'),
        );
    });

    it('обычный текст разбора не меняется и не пишет в журнал', () => {
        const { logger, log } = makeLogger();
        const text = '1. КЛИЕНТ — ✓ бухгалтер\n2. КОМПАНИЯ — ✗ не выяснено';
        const result = tidyChecklistTexts(dto({ fiveKAnalysis: text }), logger);
        expect(result.fiveKAnalysis).toBe(text);
        expect(log).not.toHaveBeenCalled();
    });

    it('пустые поля остаются как были, ключи не добавляются', () => {
        const { logger } = makeLogger();
        const result = tidyChecklistTexts(dto({ fiveKAnalysis: null }), logger);
        expect(result.fiveKAnalysis).toBeNull();
        expect('hvostAnalysis' in result).toBe(false);
    });

    it('объект вместо строки (ответ модели без проверки типов) — строки', () => {
        const { logger, log } = makeLogger();
        const raw = { client: 'Юрист;' } as unknown as string;
        const result = tidyChecklistTexts(dto({ fiveKAnalysis: raw }), logger);
        expect(result.fiveKAnalysis).toBe('Клиент: Юрист');
        expect(log).toHaveBeenCalledTimes(1);
    });
});
