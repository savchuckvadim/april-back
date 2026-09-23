import { HttpException } from '@nestjs/common';
import type { Request } from 'express';
import { AiReviewRequestDto } from '../dto/ai-review.dto';
import {
    AiAnalyticsReviewController,
    clientKeyOf,
} from '../review/ai-analytics-review.controller';

const dto: AiReviewRequestDto = {
    link: 'https://april.bitrix24.ru/crm/type/1036/details/128/',
    authorName: 'Иван',
    authorRole: 'rop',
    verdict: 'agree',
    issues: [],
};

const requestWith = (headers: Record<string, string> = {}, ip = '10.0.0.1') =>
    ({ headers, ip }) as unknown as Request;

function makeController(allowed: boolean) {
    const execute = jest.fn().mockResolvedValue({
        id: '1',
        domain: 'april.bitrix24.ru',
        itemId: 128,
        transcriptionId: null,
        managerId: null,
        analysisFound: false,
    });
    const tryConsume = jest.fn().mockReturnValue(allowed);
    const controller = new AiAnalyticsReviewController(
        { execute } as never,
        { tryConsume } as never,
    );
    return { controller, execute, tryConsume };
}

describe('AiAnalyticsReviewController', () => {
    it('лимит исчерпан → 429, сценарий не вызывается', async () => {
        const { controller, execute } = makeController(false);

        await expect(
            controller.submit(dto, requestWith()),
        ).rejects.toMatchObject({ status: 429 });
        await expect(
            controller.submit(dto, requestWith()),
        ).rejects.toBeInstanceOf(HttpException);
        expect(execute).not.toHaveBeenCalled();
    });

    it('в лимите → конверт ready с ключом домен:site-review:элемент', async () => {
        const { controller, execute, tryConsume } = makeController(true);

        const response = await controller.submit(
            dto,
            requestWith({ 'x-forwarded-for': '203.0.113.7, 10.0.0.2' }),
        );

        expect(tryConsume).toHaveBeenCalledWith('203.0.113.7');
        expect(execute).toHaveBeenCalledWith(dto);
        expect(response).toMatchObject({
            status: 'ready',
            requestKey: 'april.bitrix24.ru:site-review:128',
            data: { itemId: 128 },
        });
    });

    it('clientKeyOf: первый адрес из X-Forwarded-For, иначе ip, иначе unknown', () => {
        expect(
            clientKeyOf(
                requestWith({ 'x-forwarded-for': ' 1.1.1.1 ,2.2.2.2' }),
            ),
        ).toBe('1.1.1.1');
        expect(clientKeyOf(requestWith({}, '10.0.0.9'))).toBe('10.0.0.9');
        expect(clientKeyOf(requestWith({}, ''))).toBe('unknown');
    });
});
