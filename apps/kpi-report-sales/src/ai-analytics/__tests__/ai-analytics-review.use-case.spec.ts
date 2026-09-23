import { BadRequestException } from '@nestjs/common';
import { AGENT_ANALYSIS_TYPE, CALL_RESUME_TYPE } from '@lib/call-lib';
import { AiReviewRequestDto } from '../dto/ai-review.dto';
import { AiAnalyticsReviewUseCase } from '../review/ai-analytics-review.use-case';

const LINK = 'https://april.bitrix24.ru/crm/type/1036/details/128/';

const request = (
    over: Partial<AiReviewRequestDto> = {},
): AiReviewRequestDto => ({
    link: LINK,
    authorName: 'Иван Петров',
    authorRole: 'rop',
    verdict: 'disagree',
    issues: ['score', 'recommendations'],
    comment: 'Это повторный звонок по счёту, не презентация',
    contact: 'ivan@company.ru',
    ...over,
});

type FindByKeys = jest.Mock<Promise<unknown[]>, [string, string]>;
type SendMessage = jest.Mock<Promise<void>, [string]>;

interface Harness {
    useCase: AiAnalyticsReviewUseCase;
    resolveInfo: jest.Mock;
    findByDomainTypeKeys: FindByKeys;
    add: jest.Mock;
    sendMessage: SendMessage;
}

function makeUseCase(
    options: {
        entityTypeId?: number | null;
        rows?: Record<string, unknown[]>;
    } = {},
): Harness {
    const resolveInfo = jest
        .fn()
        .mockResolvedValue(
            options.entityTypeId === null
                ? null
                : { entityTypeId: options.entityTypeId ?? 1036, typeId: 7 },
        );
    const findByDomainTypeKeys: FindByKeys = jest.fn(
        (_domain: string, type: string) =>
            Promise.resolve(options.rows?.[type] ?? []),
    );
    const add = jest.fn().mockResolvedValue('90211');
    const sendMessage: SendMessage = jest
        .fn<Promise<void>, [string]>()
        .mockResolvedValue(undefined);
    const useCase = new AiAnalyticsReviewUseCase(
        { resolveInfo } as never,
        { findByDomainTypeKeys } as never,
        { add } as never,
        { sendMessage } as never,
    );
    return { useCase, resolveInfo, findByDomainTypeKeys, add, sendMessage };
}

const analysisRow = { transcription_id: '10245', user_id: 512 };

describe('AiAnalyticsReviewUseCase', () => {
    it('несогласие: запись disagree с деталями в payload, звонок и менеджер из глубокого разбора, сообщение в чат', async () => {
        const { useCase, add, sendMessage, findByDomainTypeKeys } = makeUseCase(
            { rows: { [AGENT_ANALYSIS_TYPE]: [analysisRow] } },
        );

        const result = await useCase.execute(request());

        expect(result).toEqual({
            id: '90211',
            domain: 'april.bitrix24.ru',
            itemId: 128,
            transcriptionId: '10245',
            managerId: '512',
            analysisFound: true,
        });
        expect(findByDomainTypeKeys).toHaveBeenCalledWith(
            'april.bitrix24.ru',
            AGENT_ANALYSIS_TYPE,
            { reportItemIds: ['128'] },
            { latestOnly: true },
        );
        const payload: unknown = expect.objectContaining({
            source: 'site',
            itemId: 128,
            entityTypeId: 1036,
            authorRole: 'rop',
            verdict: 'disagree',
            issues: ['score', 'recommendations'],
            analysisFound: true,
        });
        expect(add).toHaveBeenCalledWith(
            expect.objectContaining({
                domain: 'april.bitrix24.ru',
                kind: 'disagree',
                object: 'site-review:128',
                managerId: '512',
                transcriptionId: '10245',
                requesterUserId: null,
                reason: 'Это повторный звонок по счёту, не презентация',
                payload,
            }),
        );
        const text = sendMessage.mock.calls[0][0];
        expect(text).toContain('не согласен');
        expect(text).toContain('Иван Петров (руководитель отдела продаж)');
        expect(text).toContain('оценка завышена или занижена');
        expect(text).toContain('Транскрипция 10245');
    });

    it('согласие без комментария: запись useful, reason null', async () => {
        const { useCase, add } = makeUseCase({
            rows: { [AGENT_ANALYSIS_TYPE]: [analysisRow] },
        });

        await useCase.execute(
            request({ verdict: 'agree', issues: [], comment: undefined }),
        );

        expect(add).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'useful', reason: null }),
        );
    });

    it('разбора по элементу нет ни глубокого, ни первичного → отзыв всё равно записан без привязки к звонку', async () => {
        const { useCase, add, findByDomainTypeKeys, sendMessage } =
            makeUseCase();

        const result = await useCase.execute(request());

        expect(findByDomainTypeKeys).toHaveBeenCalledTimes(2);
        expect(findByDomainTypeKeys.mock.calls[1][1]).toBe(CALL_RESUME_TYPE);
        expect(result.analysisFound).toBe(false);
        expect(result.transcriptionId).toBeNull();
        expect(add).toHaveBeenCalledWith(
            expect.objectContaining({ transcriptionId: null, managerId: null }),
        );
        expect(sendMessage.mock.calls[0][0]).toContain('не найдена');
    });

    it('ссылка не на карточку разбора → 400', async () => {
        const { useCase, add } = makeUseCase();
        await expect(
            useCase.execute(
                request({
                    link: 'https://april.bitrix24.ru/crm/deal/details/1/',
                }),
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(add).not.toHaveBeenCalled();
    });

    it('смарт не установлен на портале → 400 с доменом; чужой смарт → 400', async () => {
        const missing = makeUseCase({ entityTypeId: null });
        await expect(missing.useCase.execute(request())).rejects.toThrow(
            /april\.bitrix24\.ru/,
        );

        const foreign = makeUseCase({ entityTypeId: 999 });
        await expect(foreign.useCase.execute(request())).rejects.toThrow(
            /другой смарт-процесс/,
        );
        expect(foreign.add).not.toHaveBeenCalled();
    });

    it('сбой чата и сбой чтения разбора отзыв не отменяют', async () => {
        const { useCase, add, sendMessage, findByDomainTypeKeys } =
            makeUseCase();
        findByDomainTypeKeys.mockRejectedValue(new Error('ais недоступна'));
        sendMessage.mockRejectedValue(new Error('telegram down'));

        const result = await useCase.execute(request());

        expect(result.id).toBe('90211');
        expect(add).toHaveBeenCalledTimes(1);
    });
});
