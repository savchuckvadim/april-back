import { CALL_REPORT_CALL_TYPE_CODES } from '@lib/call-lib';
import { DEFAULT_CLASSIFICATION_SYSTEM_PROMPT } from '@lib/vibecode';
import {
    CALL_CLASSIFY_KNOWLEDGE_KIND,
    CallClassifyInstructionService,
} from '../services/call-classify-instruction.service';

const DOMAIN = 'test.bitrix24.ru';

const makeService = (readAll: jest.Mock): CallClassifyInstructionService =>
    new CallClassifyInstructionService({ readAll } as never);

describe('дефолтная инструкция классификатора', () => {
    it('описывает каждый код справочника типов — новый тип без определения в инструкцию не попадёт молча', () => {
        for (const code of CALL_REPORT_CALL_TYPE_CODES) {
            expect(DEFAULT_CLASSIFICATION_SYSTEM_PROMPT).toContain(
                `- '${code}' —`,
            );
        }
    });

    it('приглашение на мероприятие: граница с презентацией и с упоминанием мимоходом', () => {
        expect(DEFAULT_CLASSIFICATION_SYSTEM_PROMPT).toContain(
            'ПРИГЛАШЕНИЕ НА МЕРОПРИЯТИЕ',
        );
        expect(DEFAULT_CLASSIFICATION_SYSTEM_PROMPT).toContain(
            'Всероссийский юридический форум',
        );
        expect(DEFAULT_CLASSIFICATION_SYSTEM_PROMPT).toContain(
            'упомянутое мимоходом',
        );
    });
});

describe('CallClassifyInstructionService', () => {
    it('без документов kind — дефолтная инструкция из кода', async () => {
        const readAll = jest.fn().mockResolvedValue([]);
        const service = makeService(readAll);
        await expect(service.resolve(DOMAIN)).resolves.toBe(
            DEFAULT_CLASSIFICATION_SYSTEM_PROMPT,
        );
        expect(readAll).toHaveBeenCalledWith(
            DOMAIN,
            CALL_CLASSIFY_KNOWLEDGE_KIND,
        );
    });

    it('документы kind подменяют инструкцию (объединяются)', async () => {
        const readAll = jest.fn().mockResolvedValue([
            {
                kind: CALL_CLASSIFY_KNOWLEDGE_KIND,
                fileName: 'a.md',
                source: DOMAIN,
                text: 'Новая инструкция.',
            },
            {
                kind: CALL_CLASSIFY_KNOWLEDGE_KIND,
                fileName: 'b.md',
                source: DOMAIN,
                text: 'Дополнение.',
            },
        ]);
        const service = makeService(readAll);
        await expect(service.resolve(DOMAIN)).resolves.toBe(
            'Новая инструкция.\n\nДополнение.',
        );
    });

    it('документы general/ из выдачи не попадают в инструкцию', async () => {
        const readAll = jest.fn().mockResolvedValue([
            {
                kind: 'general',
                fileName: 'company.md',
                source: DOMAIN,
                text: 'Общие материалы компании.',
            },
        ]);
        const service = makeService(readAll);
        await expect(service.resolve(DOMAIN)).resolves.toBe(
            DEFAULT_CLASSIFICATION_SYSTEM_PROMPT,
        );
    });

    it('ошибка базы знаний — дефолтная инструкция, без исключения', async () => {
        const readAll = jest.fn().mockRejectedValue(new Error('storage down'));
        const service = makeService(readAll);
        await expect(service.resolve(DOMAIN)).resolves.toBe(
            DEFAULT_CLASSIFICATION_SYSTEM_PROMPT,
        );
    });
});
