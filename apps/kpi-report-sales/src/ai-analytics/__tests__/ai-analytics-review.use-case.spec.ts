import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    findById: jest.Mock;
    resetByPattern: jest.Mock;
}

function makeUseCase(
    options: {
        entityTypeId?: number | null;
        rows?: Record<string, unknown[]>;
        /** Строка транскрипции; null — не найдена (NotFoundException). */
        transcription?: { domain: string; userId?: string } | null;
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
    const findById = jest.fn(() =>
        options.transcription
            ? Promise.resolve(options.transcription)
            : Promise.reject(new NotFoundException('Transcription not found')),
    );
    const resetByPattern = jest.fn().mockResolvedValue(1);
    const useCase = new AiAnalyticsReviewUseCase(
        { resolveInfo } as never,
        { findByDomainTypeKeys } as never,
        { add } as never,
        { sendMessage } as never,
        { findById } as never,
        { resetByPattern } as never,
    );
    return {
        useCase,
        resolveInfo,
        findByDomainTypeKeys,
        add,
        sendMessage,
        findById,
        resetByPattern,
    };
}

const analysisRow = { transcription_id: '10245', user_id: 512 };
/** Конвейер разбора ais.user_id не пишет — в записи 0. */
const analysisRowNoUser = { transcription_id: '10245', user_id: 0 };
const AGENDA_PATTERN = 'sales-ai-analytics:v1:april.bitrix24.ru:agenda:*';

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

describe('AiAnalyticsReviewUseCase: менеджер из транскрипции и кэш повестки', () => {
    it('ais.user_id пуст → менеджер из transcriptions.user_id звонка', async () => {
        const { useCase, add, findById } = makeUseCase({
            rows: { [AGENT_ANALYSIS_TYPE]: [analysisRowNoUser] },
            transcription: { domain: 'april.bitrix24.ru', userId: '512' },
        });

        const result = await useCase.execute(request());

        expect(findById).toHaveBeenCalledWith('10245');
        expect(result.managerId).toBe('512');
        expect(add).toHaveBeenCalledWith(
            expect.objectContaining({
                managerId: '512',
                transcriptionId: '10245',
            }),
        );
    });

    it('ais.user_id есть → транскрипция не читается', async () => {
        const { useCase, findById } = makeUseCase({
            rows: { [AGENT_ANALYSIS_TYPE]: [analysisRow] },
        });

        await useCase.execute(request());

        expect(findById).not.toHaveBeenCalled();
    });

    it('транскрипции нет, она чужого домена или без менеджера → managerId null, отзыв записан', async () => {
        const cases = [
            null,
            { domain: 'other.bitrix24.ru', userId: '512' },
            { domain: 'april.bitrix24.ru' },
        ];
        for (const transcription of cases) {
            const { useCase, add } = makeUseCase({
                rows: { [AGENT_ANALYSIS_TYPE]: [analysisRowNoUser] },
                transcription,
            });

            const result = await useCase.execute(request());

            expect(result.managerId).toBeNull();
            expect(result.analysisFound).toBe(true);
            expect(add).toHaveBeenCalledWith(
                expect.objectContaining({ managerId: null }),
            );
        }
    });

    it('несогласие с сайта сбрасывает кэш повестки домена', async () => {
        const { useCase, resetByPattern } = makeUseCase({
            rows: { [AGENT_ANALYSIS_TYPE]: [analysisRow] },
        });

        await useCase.execute(request());

        expect(resetByPattern).toHaveBeenCalledTimes(1);
        expect(resetByPattern).toHaveBeenCalledWith(AGENDA_PATTERN);
    });

    it('согласие повестку не меняет — кэш не трогается; сбой кэша отзыв не отменяет', async () => {
        const agree = makeUseCase({
            rows: { [AGENT_ANALYSIS_TYPE]: [analysisRow] },
        });
        await agree.useCase.execute(request({ verdict: 'agree', issues: [] }));
        expect(agree.resetByPattern).not.toHaveBeenCalled();

        const broken = makeUseCase();
        broken.resetByPattern.mockRejectedValue(new Error('redis down'));
        const result = await broken.useCase.execute(request());
        expect(result.id).toBe('90211');
    });
});
