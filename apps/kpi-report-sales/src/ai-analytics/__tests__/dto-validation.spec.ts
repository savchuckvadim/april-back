import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AiAboutRequestDto } from '../dto/ai-about.dto';
import { AiBriefRequestDto } from '../dto/ai-brief.dto';
import { AiByTypeRequestDto } from '../dto/ai-by-type.dto';
import { AiCacheResetRequestDto } from '../dto/ai-cache-reset.dto';
import { AiDailyPlanRequestDto } from '../dto/ai-daily-plan.dto';
import { AiFeedbackListRequestDto } from '../dto/ai-feedback-list.dto';
import { AiFeedbackRequestDto } from '../dto/ai-feedback.dto';
import { AI_DOSSIER_MONTHS } from '../constants/ai-dossier.const';
import { AiDossierRequestDto } from '../dto/ai-dossier.dto';
import { AI_PLAN_FACT_MANAGERS_MAX } from '../constants/ai-plan-fact.const';
import { AiPlanFactRequestDto } from '../dto/ai-plan-fact.dto';
import { AiPulseRequestDto } from '../dto/ai-pulse.dto';
import { AiPushRequestDto } from '../dto/ai-push.dto';
import {
    AiRopMarkPickRequestDto,
    AiRopMarkSaveRequestDto,
} from '../dto/ai-rop-mark-request.dto';
import { AiReviewRequestDto } from '../dto/ai-review.dto';
import { AiStyleProfileRequestDto } from '../dto/ai-style-card.dto';

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

describe('DTO валидация ручек Фазы 2 (поток 19)', () => {
    it('brief: период обязателен, from ≤ to и не длиннее 3 месяцев, managerIds — целые ≥ 1', async () => {
        const period = { ...base, from: '2026-09-01', to: '2026-09-07' };
        const ok = await run(AiBriefRequestDto, {
            ...period,
            managerIds: [447, 512],
            forceRefresh: true,
        });
        expect(ok).toEqual({
            ...period,
            managerIds: [447, 512],
            forceRefresh: true,
        });
        expect(
            (await run(AiBriefRequestDto, period)).managerIds,
        ).toBeUndefined();
        expect(await failsOn(AiBriefRequestDto, base)).toContain('from');
        expect(
            await failsOn(AiBriefRequestDto, { ...base, from: '2026-09-01' }),
        ).toContain('to');
        expect(
            await failsOn(AiBriefRequestDto, {
                ...base,
                from: '2026-09-07',
                to: '2026-09-01',
            }),
        ).toContain('to');
        // 1 сентября + 3 месяца − 1 день = 30 ноября; 1 декабря уже длиннее.
        expect(
            await failsOn(AiBriefRequestDto, {
                ...base,
                from: '2026-09-01',
                to: '2026-12-01',
            }),
        ).toContain('to');
        expect(
            await failsOn(AiBriefRequestDto, {
                ...period,
                managerIds: ['447'],
            }),
        ).toContain('managerIds');
        expect(
            await failsOn(AiBriefRequestDto, { ...period, managerIds: [0] }),
        ).toContain('managerIds');
        expect(
            await failsOn(AiBriefRequestDto, {
                ...period,
                forceRefresh: 'yes',
            }),
        ).toContain('forceRefresh');
    });

    it('plan/daily: managerId и date необязательны, date только YYYY-MM-DD', async () => {
        expect(await run(AiDailyPlanRequestDto, base)).toEqual(base);
        const ok = await run(AiDailyPlanRequestDto, {
            ...base,
            managerId: '11',
            date: '2026-09-08',
        });
        expect(ok.managerId).toBe('11');
        expect(ok.date).toBe('2026-09-08');
        expect(
            await failsOn(AiDailyPlanRequestDto, {
                ...base,
                date: '08.09.2026',
            }),
        ).toContain('date');
        expect(
            await failsOn(AiDailyPlanRequestDto, { ...base, managerId: 11 }),
        ).toContain('managerId');
        expect(
            await failsOn(AiDailyPlanRequestDto, {
                ...base,
                managerId: '1'.repeat(33),
            }),
        ).toContain('managerId');
    });

    it('manager/style: managerId обязателен и непуст, monthKey только YYYY-MM', async () => {
        const ok = await run(AiStyleProfileRequestDto, {
            ...base,
            managerId: '512',
            monthKey: '2026-08',
        });
        expect(ok.monthKey).toBe('2026-08');
        expect(
            (await run(AiStyleProfileRequestDto, { ...base, managerId: '512' }))
                .monthKey,
        ).toBeUndefined();
        expect(await failsOn(AiStyleProfileRequestDto, base)).toContain(
            'managerId',
        );
        expect(
            await failsOn(AiStyleProfileRequestDto, { ...base, managerId: '' }),
        ).toContain('managerId');
        expect(
            await failsOn(AiStyleProfileRequestDto, {
                ...base,
                managerId: '512',
                monthKey: '2026-08-01',
            }),
        ).toContain('monthKey');
    });

    it('rop-mark/pick: weekKey только YYYY-Www, date только YYYY-MM-DD, forceRefresh — boolean', async () => {
        const ok = await run(AiRopMarkPickRequestDto, {
            ...base,
            weekKey: '2026-W36',
            forceRefresh: false,
        });
        expect(ok).toEqual({
            ...base,
            weekKey: '2026-W36',
            forceRefresh: false,
        });
        expect(await run(AiRopMarkPickRequestDto, base)).toEqual(base);
        expect(
            await failsOn(AiRopMarkPickRequestDto, {
                ...base,
                weekKey: '2026-36',
            }),
        ).toContain('weekKey');
        expect(
            await failsOn(AiRopMarkPickRequestDto, {
                ...base,
                date: '3 сентября',
            }),
        ).toContain('date');
        expect(
            await failsOn(AiRopMarkPickRequestDto, {
                ...base,
                forceRefresh: 'да',
            }),
        ).toContain('forceRefresh');
    });

    it('rop-mark/save: звонок и согласие обязательны, оценка 1–10, разделы из рубрики, тексты ≤ 2000', async () => {
        const mark = { ...base, transcriptionId: '103', agree: false };
        const ok = await run(AiRopMarkSaveRequestDto, {
            ...mark,
            ropScore: 6,
            sections: ['NEEDS', 'CLOSING'],
            why: 'Потребность не выявлена',
            howTo: 'Два вопроса про процесс до предложения',
        });
        expect(ok.ropScore).toBe(6);
        expect(ok.sections).toEqual(['NEEDS', 'CLOSING']);
        expect(await run(AiRopMarkSaveRequestDto, mark)).toEqual(mark);
        expect(
            await failsOn(AiRopMarkSaveRequestDto, { ...base, agree: true }),
        ).toContain('transcriptionId');
        expect(
            await failsOn(AiRopMarkSaveRequestDto, {
                ...base,
                transcriptionId: '103',
            }),
        ).toContain('agree');
        expect(
            await failsOn(AiRopMarkSaveRequestDto, { ...mark, ropScore: 0 }),
        ).toContain('ropScore');
        expect(
            await failsOn(AiRopMarkSaveRequestDto, { ...mark, ropScore: 11 }),
        ).toContain('ropScore');
        expect(
            await failsOn(AiRopMarkSaveRequestDto, { ...mark, ropScore: 6.5 }),
        ).toContain('ropScore');
        expect(
            await failsOn(AiRopMarkSaveRequestDto, {
                ...mark,
                sections: ['NEEDS', 'FOO'],
            }),
        ).toContain('sections');
        expect(
            await failsOn(AiRopMarkSaveRequestDto, {
                ...mark,
                why: 'x'.repeat(2001),
            }),
        ).toContain('why');
    });

    it('about: endpoint обязателен и только из справочника ручек', async () => {
        const ok = await run(AiAboutRequestDto, {
            ...base,
            endpoint: 'plan/daily',
        });
        expect(ok.endpoint).toBe('plan/daily');
        expect(await failsOn(AiAboutRequestDto, base)).toContain('endpoint');
        // Досье и план-факт появились в справочнике волной 2 Фазы 3.
        const dossier = await run(AiAboutRequestDto, {
            ...base,
            endpoint: 'dossier',
        });
        expect(dossier.endpoint).toBe('dossier');
        expect(
            await failsOn(AiAboutRequestDto, { ...base, endpoint: 'nope' }),
        ).toContain('endpoint');
    });
});

describe('DTO валидация отзыва с сайта (AiReviewRequestDto)', () => {
    const review = {
        link: 'https://april.bitrix24.ru/crm/type/1036/details/128/',
        authorName: 'Иван',
        authorRole: 'rop',
        verdict: 'disagree',
        issues: ['score'],
        comment: 'оценка завышена',
    };

    it('валидный отзыв проходит, неизвестные поля вырезаются', async () => {
        const dto = await run(AiReviewRequestDto, { ...review, hack: 1 });
        expect(dto).toEqual(review);
    });

    it('ссылка только на карточку элемента смарта', async () => {
        expect(
            await failsOn(AiReviewRequestDto, {
                ...review,
                link: 'https://april.bitrix24.ru/crm/deal/details/1/',
            }),
        ).toContain('карточку разбора');
    });

    it('роль, вердикт и пункты — только из справочников', async () => {
        expect(
            await failsOn(AiReviewRequestDto, {
                ...review,
                authorRole: 'boss',
            }),
        ).toContain('authorRole');
        expect(
            await failsOn(AiReviewRequestDto, { ...review, verdict: 'maybe' }),
        ).toContain('verdict');
        expect(
            await failsOn(AiReviewRequestDto, { ...review, issues: ['tone'] }),
        ).toContain('issues');
    });

    it('комментарий обязателен при частичном согласии и несогласии, при согласии — нет', async () => {
        expect(
            await failsOn(AiReviewRequestDto, { ...review, comment: '' }),
        ).toContain('что именно не так');
        const agreed = await run(AiReviewRequestDto, {
            ...review,
            verdict: 'agree',
            issues: [],
            comment: undefined,
        });
        expect(agreed.verdict).toBe('agree');
        // При согласии переданный комментарий всё равно должен быть строкой.
        expect(
            await failsOn(AiReviewRequestDto, {
                ...review,
                verdict: 'agree',
                comment: 123,
            }),
        ).toContain('comment');
    });
});

// --- Фаза 3, поток П2 «реконсиляция план-факт» ---

describe('DTO валидация реконсиляции план-факт (AiPlanFactRequestDto)', () => {
    it('monthKey обязателен и строго в формате YYYY-MM', async () => {
        expect(await failsOn(AiPlanFactRequestDto, base)).toContain('monthKey');
        expect(
            await failsOn(AiPlanFactRequestDto, {
                ...base,
                monthKey: '2026-9',
            }),
        ).toContain('YYYY-MM');
        expect(
            await failsOn(AiPlanFactRequestDto, {
                ...base,
                monthKey: '2026-09-01',
            }),
        ).toContain('YYYY-MM');
        // Номер месяца вне 01..12 тоже не проходит.
        expect(
            await failsOn(AiPlanFactRequestDto, {
                ...base,
                monthKey: '2026-13',
            }),
        ).toContain('YYYY-MM');
    });

    it('валидный запрос проходит, неизвестные поля вырезаются', async () => {
        const dto = await run(AiPlanFactRequestDto, {
            ...base,
            monthKey: '2026-09',
            hack: true,
        });
        expect(dto).toEqual({ ...base, monthKey: '2026-09' });
    });

    it('managerIds необязателен, но только массив строк и не длиннее лимита', async () => {
        const dto = await run(AiPlanFactRequestDto, {
            ...base,
            monthKey: '2026-09',
            managerIds: ['447', '512'],
        });
        expect(dto.managerIds).toEqual(['447', '512']);
        expect(
            await failsOn(AiPlanFactRequestDto, {
                ...base,
                monthKey: '2026-09',
                managerIds: [447],
            }),
        ).toContain('managerIds');
        expect(
            await failsOn(AiPlanFactRequestDto, {
                ...base,
                monthKey: '2026-09',
                managerIds: Array.from(
                    { length: AI_PLAN_FACT_MANAGERS_MAX + 1 },
                    (_, index) => String(index),
                ),
            }),
        ).toContain('не больше');
    });
});

// --- Фаза 3, поток П4 «досье менеджера» ---

describe('DTO валидация досье менеджера (AiDossierRequestDto)', () => {
    const dossier = { ...base, managerId: '512' };

    it('managerId обязателен и непустой', async () => {
        expect(await failsOn(AiDossierRequestDto, base)).toContain('managerId');
        expect(
            await failsOn(AiDossierRequestDto, { ...base, managerId: '' }),
        ).toContain('managerId');
    });

    it('months необязателен; вне 1..12 и дробный не проходят', async () => {
        const dto = await run(AiDossierRequestDto, dossier);
        expect(dto.months).toBeUndefined();

        expect(
            await failsOn(AiDossierRequestDto, {
                ...dossier,
                months: AI_DOSSIER_MONTHS.min - 1,
            }),
        ).toContain('не меньше');
        expect(
            await failsOn(AiDossierRequestDto, {
                ...dossier,
                months: AI_DOSSIER_MONTHS.max + 1,
            }),
        ).toContain('не больше');
        expect(
            await failsOn(AiDossierRequestDto, { ...dossier, months: 2.5 }),
        ).toContain('months');
    });

    it('границы окна проходят как есть', async () => {
        for (const months of [AI_DOSSIER_MONTHS.min, AI_DOSSIER_MONTHS.max]) {
            const dto = await run(AiDossierRequestDto, { ...dossier, months });
            expect(dto.months).toBe(months);
        }
    });

    it('валидный запрос проходит, неизвестные поля вырезаются', async () => {
        const dto = await run(AiDossierRequestDto, {
            ...dossier,
            months: AI_DOSSIER_MONTHS.default,
            socketId: 'sock',
            forceRefresh: true,
            hack: true,
        });
        expect(dto).toEqual({
            ...dossier,
            months: AI_DOSSIER_MONTHS.default,
            socketId: 'sock',
            forceRefresh: true,
        });
    });

    it('forceRefresh — только boolean, socketId — только строка', async () => {
        expect(
            await failsOn(AiDossierRequestDto, {
                ...dossier,
                forceRefresh: 'да',
            }),
        ).toContain('forceRefresh');
        expect(
            await failsOn(AiDossierRequestDto, { ...dossier, socketId: 7 }),
        ).toContain('socketId');
    });
});
