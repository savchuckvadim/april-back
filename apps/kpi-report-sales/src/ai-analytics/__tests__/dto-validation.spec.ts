import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AiByTypeRequestDto } from '../dto/ai-by-type.dto';
import { AiCacheResetRequestDto } from '../dto/ai-cache-reset.dto';
import { AiFeedbackListRequestDto } from '../dto/ai-feedback-list.dto';
import { AiFeedbackRequestDto } from '../dto/ai-feedback.dto';
import { AiPulseRequestDto } from '../dto/ai-pulse.dto';
import { AiPushRequestDto } from '../dto/ai-push.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });

async function run<T extends object>(
    metatype: new () => T,
    plain: object,
): Promise<T> {
    return pipe.transform(plain, { type: 'body', metatype }) as Promise<T>;
}

async function failsOn<T extends object>(
    metatype: new () => T,
    plain: object,
): Promise<string> {
    try {
        await run(metatype, plain);
    } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        return JSON.stringify((error as BadRequestException).getResponse());
    }
    throw new Error('ожидалась ошибка валидации');
}

const base = { domain: 'april.bitrix24.ru', requesterUserId: '447' };

describe('DTO валидация ai-analytics (ValidationPipe, whitelist)', () => {
    it('domain и requesterUserId обязательны', async () => {
        expect(
            await failsOn(AiPulseRequestDto, { domain: base.domain }),
        ).toContain('requesterUserId');
        expect(
            await failsOn(AiPulseRequestDto, { requesterUserId: '447' }),
        ).toContain('domain');
    });

    it('whitelist вырезает неизвестные поля', async () => {
        const dto = await run(AiPulseRequestDto, { ...base, hack: true });
        expect(dto).toEqual(base);
    });

    it('feedback: kind только из AI_ANALYTICS_FEEDBACK_KINDS, object обязателен', async () => {
        const ok = await run(AiFeedbackRequestDto, {
            ...base,
            kind: 'disagree',
            object: 'call:1',
            reason: 'ошибка разбора',
        });
        expect(ok.kind).toBe('disagree');
        expect(
            await failsOn(AiFeedbackRequestDto, {
                ...base,
                kind: 'like',
                object: 'call:1',
            }),
        ).toContain('kind');
        expect(
            await failsOn(AiFeedbackRequestDto, { ...base, kind: 'view' }),
        ).toContain('object');
    });

    it('feedback/list: даты только YYYY-MM-DD', async () => {
        const ok = await run(AiFeedbackListRequestDto, {
            ...base,
            from: '2026-09-01',
            to: '2026-09-30',
        });
        expect(ok.managerId).toBeUndefined();
        expect(
            await failsOn(AiFeedbackListRequestDto, {
                ...base,
                from: '01.09.2026',
                to: '2026-09-30',
            }),
        ).toContain('from');
    });

    it('cache/reset: scope из справочника, по умолчанию отсутствует', async () => {
        const ok = await run(AiCacheResetRequestDto, {
            ...base,
            scope: 'pulse',
        });
        expect(ok.scope).toBe('pulse');
        expect((await run(AiCacheResetRequestDto, base)).scope).toBeUndefined();
        expect(
            await failsOn(AiCacheResetRequestDto, { ...base, scope: 'hot' }),
        ).toContain('scope');
    });

    it('push: kind из справочника, date YYYY-MM-DD, recipients — целые ≥ 1', async () => {
        const ok = await run(AiPushRequestDto, {
            ...base,
            kind: 'digest',
            date: '2026-09-07',
            recipients: [447, 448],
        });
        expect(ok).toEqual({
            ...base,
            kind: 'digest',
            date: '2026-09-07',
            recipients: [447, 448],
        });
        expect(
            (await run(AiPushRequestDto, { ...base, kind: 'digest_all' })).kind,
        ).toBe('digest_all');
        expect(await failsOn(AiPushRequestDto, base)).toContain('kind');
        expect(
            await failsOn(AiPushRequestDto, { ...base, kind: 'alerts' }),
        ).toContain('kind');
        expect(
            await failsOn(AiPushRequestDto, {
                ...base,
                kind: 'agenda',
                date: '07.09.2026',
            }),
        ).toContain('date');
        expect(
            await failsOn(AiPushRequestDto, {
                ...base,
                kind: 'agenda',
                recipients: ['447'],
            }),
        ).toContain('recipients');
        expect(
            await failsOn(AiPushRequestDto, {
                ...base,
                kind: 'agenda',
                recipients: [0],
            }),
        ).toContain('recipients');
    });

    it('by-type: callType — all, тип справочника или objections; layout — wide|long', async () => {
        const period = { ...base, from: '2026-08-10', to: '2026-09-06' };
        const all = await run(AiByTypeRequestDto, {
            ...period,
            callType: 'all',
        });
        expect(all.callType).toBe('all');
        expect(all.layout).toBeUndefined();
        expect(
            (
                await run(AiByTypeRequestDto, {
                    ...period,
                    callType: 'presentation',
                    layout: 'long',
                })
            ).layout,
        ).toBe('long');
        expect(
            (
                await run(AiByTypeRequestDto, {
                    ...period,
                    callType: 'objections',
                })
            ).callType,
        ).toBe('objections');
        expect(await failsOn(AiByTypeRequestDto, period)).toContain('callType');
        expect(
            await failsOn(AiByTypeRequestDto, { ...period, callType: 'every' }),
        ).toContain('callType');
        expect(
            await failsOn(AiByTypeRequestDto, { ...period, callType: 'ALL' }),
        ).toContain('callType');
        expect(
            await failsOn(AiByTypeRequestDto, {
                ...period,
                callType: 'all',
                layout: 'grid',
            }),
        ).toContain('layout');
    });
});
