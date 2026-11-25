import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CALL_BADGE_IDS } from '@lib/sales-ai-analytics';
import {
    CALLS_LIST_BADGES_MAX,
    CALLS_LIST_POINTS_MAX,
} from '../calls-list.const';
import { callListQueryOf } from '../calls-list.presenter';
import { isPeriodWithinDays, periodDays } from '../dto/calls-period.validator';
import { CallsListRequestDto } from '../dto/calls-list-request.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const base = {
    domain: 'gsr.bitrix24.ru',
    requesterUserId: '447',
    from: '2026-11-01',
    to: '2026-11-19',
};

const validate = (
    body: Record<string, unknown>,
): Promise<CallsListRequestDto> =>
    pipe.transform(
        { ...base, ...body },
        { type: 'body', metatype: CallsListRequestDto },
    ) as Promise<CallsListRequestDto>;

describe('CallsListRequestDto', () => {
    it('минимальный запрос проходит, необязательные поля пустые', async () => {
        const dto = await validate({});
        expect(dto.page).toBeUndefined();
        expect(dto.review).toBeUndefined();
    });

    it('период: не длиннее 92 дней и начало не позже конца', async () => {
        expect(periodDays('2026-11-01', '2026-11-01')).toBe(1);
        expect(isPeriodWithinDays('2026-09-01', '2026-12-01')).toBe(true);
        expect(isPeriodWithinDays('2026-09-01', '2026-12-02')).toBe(false);
        await expect(
            validate({ from: '2026-11-20', to: '2026-11-19' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            validate({ from: '2026-01-01', to: '2026-11-19' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(validate({ from: '01.11.2026' })).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('страница с 1, размер не больше 100', async () => {
        await expect(validate({ page: 0 })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(validate({ pageSize: 101 })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        const dto = await validate({ page: 3, pageSize: 100 });
        expect(dto.page).toBe(3);
    });

    it('оценка 1–10, фильтры и порядок — только из справочников', async () => {
        await expect(validate({ scoreMin: 0 })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(validate({ scoreMax: 11 })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(validate({ review: 'mine' })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(validate({ sort: 'name' })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(validate({ managerIds: ['abc'] })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        const dto = await validate({
            scoreMin: 2.5,
            scoreMax: 7,
            review: 'disagreed',
            sort: 'score_asc',
            managerIds: ['447'],
            callTypes: ['cold'],
        });
        expect(dto).toMatchObject({ scoreMin: 2.5, sort: 'score_asc' });
    });
});

describe('CallsListRequestDto: бейджи', () => {
    it('бейджи не заданы — поля пустые, запрос проходит', async () => {
        const dto = await validate({});
        expect(dto.badges).toBeUndefined();
        expect(dto.points).toBeUndefined();
    });

    it('бейджи — коды справочника: каждый принимается', async () => {
        const dto = await validate({ badges: [...CALL_BADGE_IDS] });
        expect(dto.badges).toEqual([...CALL_BADGE_IDS]);
    });

    it('неизвестный бейдж, не массив и не строка — 400', async () => {
        await expect(
            validate({ badges: ['step_missing', 'нет_такого'] }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            validate({ badges: 'step_missing' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(validate({ badges: [5] })).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('бейджей не больше предела: на пределе проходит, сверх — 400', async () => {
        const atLimit = Array.from(
            { length: CALLS_LIST_BADGES_MAX },
            () => 'signal',
        );
        await expect(validate({ badges: atLimit })).resolves.toBeDefined();
        await expect(
            validate({ badges: [...atLimit, 'signal'] }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('CallsListRequestDto: бейджи пунктов методики', () => {
    it('код и состояние — проходят и становятся объектами DTO', async () => {
        const dto = await validate({
            points: [
                { code: 'pres.spirals_min', state: 'missed' },
                { code: 'cold-no-price', state: 'done' },
            ],
        });
        expect(dto.points).toEqual([
            { code: 'pres.spirals_min', state: 'missed' },
            { code: 'cold-no-price', state: 'done' },
        ]);
    });

    it('код не по шаблону пункта или длиннее 64 знаков — 400', async () => {
        for (const code of [
            'Pres.A',
            '1abc',
            'a b',
            'a..b',
            '',
            'x'.repeat(65),
        ]) {
            await expect(
                validate({ points: [{ code, state: 'done' }] }),
            ).rejects.toBeInstanceOf(BadRequestException);
        }
        await expect(
            validate({ points: [{ code: 'a'.repeat(64), state: 'done' }] }),
        ).resolves.toBeDefined();
    });

    it('состояние — только done или missed', async () => {
        for (const state of ['not_applicable', 'any', '', 1]) {
            await expect(
                validate({ points: [{ code: 'pres.a', state }] }),
            ).rejects.toBeInstanceOf(BadRequestException);
        }
        await expect(
            validate({ points: [{ code: 'pres.a' }] }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('не массив объектов — 400; пунктов не больше предела', async () => {
        await expect(validate({ points: 'pres.a' })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(validate({ points: ['pres.a'] })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        const atLimit = Array.from(
            { length: CALLS_LIST_POINTS_MAX },
            (_, i) => ({
                code: `pres.p${i}`,
                state: 'done',
            }),
        );
        await expect(validate({ points: atLimit })).resolves.toBeDefined();
        await expect(
            validate({
                points: [...atLimit, { code: 'pres.extra', state: 'done' }],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('callListQueryOf: бейджи', () => {
    it('по умолчанию бейджей и пунктов нет', async () => {
        const query = callListQueryOf(await validate({}));
        expect(query.badges).toEqual([]);
        expect(query.points).toEqual([]);
    });

    it('повторные бейджи схлопываются, порядок выбора сохраняется', async () => {
        const query = callListQueryOf(
            await validate({
                badges: ['signal', 'step_missing', 'signal', 'step_missing'],
            }),
        );
        expect(query.badges).toEqual(['signal', 'step_missing']);
    });

    it('пункты: на код один бейдж, побеждает последний', async () => {
        const query = callListQueryOf(
            await validate({
                points: [
                    { code: 'pres.a', state: 'done' },
                    { code: 'pres.b', state: 'missed' },
                    { code: 'pres.a', state: 'missed' },
                ],
            }),
        );
        expect(query.points).toEqual([
            { code: 'pres.a', state: 'missed' },
            { code: 'pres.b', state: 'missed' },
        ]);
    });
});
