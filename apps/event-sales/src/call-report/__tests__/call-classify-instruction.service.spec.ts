import { DEFAULT_CLASSIFICATION_SYSTEM_PROMPT } from '@lib/vibecode';
import {
    CALL_CLASSIFY_KNOWLEDGE_KIND,
    CallClassifyInstructionService,
} from '../services/call-classify-instruction.service';

const DOMAIN = 'test.bitrix24.ru';

const makeService = (readAll: jest.Mock): CallClassifyInstructionService =>
    new CallClassifyInstructionService({ readAll } as never);

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
