import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AI_ANALYTICS_FEEDBACK_KINDS } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_USER_FEEDBACK_KINDS } from '../constants/ai-feedback.const';
import { AiFeedbackRequestDto } from '../dto/ai-feedback.dto';

/**
 * Дыра служебных видов: ручка `POST ai-analytics/feedback` принимала
 * alert_sent / digest_sent / agenda_sent / rop_mark, и любой пользователь
 * мог записать «доставлено» и тем подавить дайджест или алерт. Теперь DTO
 * пускает только реакции пользователя; служебные виды пишут внутренние
 * контуры напрямую через стор.
 */
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const base = {
    domain: 'april.bitrix24.ru',
    requesterUserId: '447',
    object: 'call:1024',
};

const SERVICE_KINDS = AI_ANALYTICS_FEEDBACK_KINDS.filter(
    kind =>
        !(AI_ANALYTICS_USER_FEEDBACK_KINDS as readonly string[]).includes(kind),
);

async function validate(kind: string): Promise<AiFeedbackRequestDto> {
    return pipe.transform(
        { ...base, kind },
        { type: 'body', metatype: AiFeedbackRequestDto },
    ) as Promise<AiFeedbackRequestDto>;
}

describe('AiFeedbackRequestDto: только виды реакций пользователя', () => {
    it('служебные виды перечислены полностью (страховка от пустого набора)', () => {
        expect([...SERVICE_KINDS].sort()).toEqual([
            'agenda_sent',
            'alert_sent',
            'digest_sent',
            'rop_mark',
        ]);
    });

    it.each(SERVICE_KINDS)('служебный вид %s отклоняется с 400', async kind => {
        await expect(validate(kind)).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it.each([...AI_ANALYTICS_USER_FEEDBACK_KINDS])(
        'реакция %s проходит валидацию',
        async kind => {
            const dto = await validate(kind);
            expect(dto.kind).toBe(kind);
        },
    );

    it('Swagger enum совпадает с набором пользовательских видов', () => {
        const meta = Reflect.getMetadata(
            'swagger/apiModelProperties',
            AiFeedbackRequestDto.prototype,
            'kind',
        ) as { enum?: unknown; description?: unknown } | undefined;
        expect(meta?.enum).toEqual([...AI_ANALYTICS_USER_FEEDBACK_KINDS]);
        expect(String(meta?.description)).toContain('отклоняются');
    });
});
