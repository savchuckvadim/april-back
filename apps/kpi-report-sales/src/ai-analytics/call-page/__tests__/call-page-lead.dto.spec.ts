import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CallPageLeadReviewRequestDto } from '../dto/call-page-lead.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });

const item = {
    kind: 'section',
    ref: 'NEEDS',
    label: 'Выяснение потребностей',
    comment: 'не выяснял',
};

const validate = (
    body: Record<string, unknown>,
): Promise<CallPageLeadReviewRequestDto> =>
    pipe.transform(
        { agree: true, ...body },
        { type: 'body', metatype: CallPageLeadReviewRequestDto },
    ) as Promise<CallPageLeadReviewRequestDto>;

const rejects = (body: Record<string, unknown>): Promise<void> =>
    expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);

describe('CallPageLeadReviewRequestDto: лимиты отзыва', () => {
    it('полный отзыв на пределе лимитов проходит', async () => {
        const dto = await validate({
            agree: false,
            leaderScore: 10,
            items: Array.from({ length: 30 }, () => ({
                ...item,
                label: 'л'.repeat(300),
                comment: 'к'.repeat(2000),
            })),
            comment: 'р'.repeat(20000),
        });
        expect(dto.items).toHaveLength(30);
        expect(dto.comment).toHaveLength(20000);
    });

    it('без оценки и комментария — тоже можно', async () => {
        const dto = await validate({ leaderScore: null });
        expect(dto.leaderScore).toBeNull();
    });

    it('согласие обязательно', async () => {
        await expect(
            pipe.transform(
                {},
                { type: 'body', metatype: CallPageLeadReviewRequestDto },
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('оценка 1–10, целая', async () => {
        await rejects({ leaderScore: 0 });
        await rejects({ leaderScore: 11 });
        await rejects({ leaderScore: 5.5 });
    });

    it('длинный комментарий, лишние пункты, длинные подписи — 400', async () => {
        await rejects({ comment: 'р'.repeat(20001) });
        await rejects({ items: Array.from({ length: 31 }, () => item) });
        await rejects({ items: [{ ...item, label: 'л'.repeat(301) }] });
        await rejects({ items: [{ ...item, comment: 'к'.repeat(2001) }] });
        await rejects({ items: [{ ...item, ref: '' }] });
        await rejects({ items: [{ ...item, kind: 'manager' }] });
    });
});
