import { Logger } from '@nestjs/common';
import { buildDeepAnalysisUserContent } from '../contracts/call-deep-analysis.contract';
import { CallDeepAnalysisService } from '../services/call-deep-analysis.service';
import {
    type FakeLongCall,
    markerOf,
    noLongCall,
    withLongCall,
} from './call-long-input.fake';

/**
 * Этап 4г: цельный разбор (страховка после неудачного фокус-разбора) на
 * длинном разговоре идёт текстом «целиком», на коротком — как раньше.
 */
const DOMAIN = 'test.bitrix24.ru';
const FULL = 'ПОЛНАЯ-РАСШИФРОВКА: алло, добрый день';

const makeDeps = (longCall: FakeLongCall) => {
    const llm = {
        structuredCompletionWithUsage: jest.fn().mockResolvedValue({
            result: { summary: 'Разговор', score: 7, sections: [] },
            usage: {
                promptTokens: 900,
                completionTokens: 100,
                totalTokens: 1000,
            },
            model: 'bitrix/bitrixgpt-5.5',
        }),
    };
    const service = new CallDeepAnalysisService(
        llm as never,
        { readAll: jest.fn().mockResolvedValue([]) } as never,
        { resolve: jest.fn().mockResolvedValue({ types: {} }) } as never,
        {
            resolve: jest
                .fn()
                .mockResolvedValue({ withCheckPresentation: false }),
        } as never,
        {
            resolve: jest
                .fn()
                .mockResolvedValue({ presentationStrictness: 'strict' }),
        } as never,
        longCall as never,
    );
    /** User-часть единственного запроса к модели. */
    const userOf = (): string =>
        (llm.structuredCompletionWithUsage.mock.calls[0] as string[])[1];

    return { service, llm, longCall, userOf };
};

describe('CallDeepAnalysisService: длинный разговор', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('длинный путь: в запрос уходит текст «целиком», расход и метка — с подготовкой', async () => {
        const { service, userOf, longCall } = makeDeps(withLongCall());

        const dto = await service.run(DOMAIN, FULL, 'call', 'ПАСПОРТ', {
            model: 'bitrix/own',
        });

        expect(longCall.prepare).toHaveBeenCalledWith(DOMAIN, FULL, {
            model: 'bitrix/own',
        });
        expect(userOf()).toBe(
            buildDeepAnalysisUserContent(markerOf('whole'), 'call', 'ПАСПОРТ'),
        );
        expect(userOf()).not.toContain(FULL);
        // Вызов разбора 1000 токенов и два ответа подготовки по 60.
        expect(dto?.usage).toMatchObject({ tokens: 1120, calls: 3 });
        expect(dto?.extra).toEqual({
            longCall: {
                parts: 7,
                partsWithoutDigest: 1,
                hasSummary: true,
                transcriptChars: 58_400,
                sourceChars: 140_200,
            },
        });
    });

    it('короткий разговор (prepare → null): запрос и расход как раньше', async () => {
        const { service, userOf } = makeDeps(noLongCall());

        const dto = await service.run(DOMAIN, FULL, 'call', 'ПАСПОРТ');

        expect(userOf()).toBe(
            buildDeepAnalysisUserContent(FULL, 'call', 'ПАСПОРТ'),
        );
        expect(dto?.usage).toMatchObject({ tokens: 1000, calls: 1 });
        expect(dto?.extra).toBeUndefined();
    });
});
