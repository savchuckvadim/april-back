import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
    COLD_CALL_FORCE_DEFAULT,
    ColdCallQueryDto,
    EnumColdCallEntityType,
    EnumColdCallForce,
    EnumColdCallIsTmc,
} from './cold.dto';
import { isForcedColdCall, toColdCallData } from '../lib/cold-call-data';

/**
 * Флаг `force` хука v2: необязателен, принимает только Y/N, дефолт — N
 * («чужую работу молча не отбираем», решение владельца 02.09.2026).
 */
const base = {
    entityType: EnumColdCallEntityType.DEAL,
    entityId: '500',
    responsible: 'user_447',
    created: 'user_1',
    deadline: '05.09.2026 11:00:00',
    name: 'ООО Ромашка',
    isTmc: EnumColdCallIsTmc.N,
};

describe('ColdCallQueryDto.force', () => {
    it('без force валиден (старые вызовы не ломаются)', async () => {
        const dto = plainToInstance(ColdCallQueryDto, base);
        expect(await validate(dto)).toHaveLength(0);
    });

    it.each([EnumColdCallForce.Y, EnumColdCallForce.N])(
        'force=%s валиден',
        async force => {
            const dto = plainToInstance(ColdCallQueryDto, { ...base, force });
            expect(await validate(dto)).toHaveLength(0);
        },
    );

    it('force вне Y/N — ошибка валидации', async () => {
        const dto = plainToInstance(ColdCallQueryDto, { ...base, force: 'X' });
        const errors = await validate(dto);
        expect(errors.map(e => e.property)).toEqual(['force']);
    });
});

describe('toColdCallData', () => {
    it('без force подставляет дефолт N', () => {
        const data = toColdCallData(plainToInstance(ColdCallQueryDto, base));
        expect(data.force).toBe(COLD_CALL_FORCE_DEFAULT);
        expect(data.force).toBe(EnumColdCallForce.N);
        expect(isForcedColdCall(data)).toBe(false);
    });

    it('force=Y сохраняется — режим «забрать клиента»', () => {
        const data = toColdCallData(
            plainToInstance(ColdCallQueryDto, {
                ...base,
                force: EnumColdCallForce.Y,
            }),
        );
        expect(isForcedColdCall(data)).toBe(true);
    });

    it('остальные поля хука переносятся как есть', () => {
        const data = toColdCallData(plainToInstance(ColdCallQueryDto, base));
        // user_<id> → число делает сам декоратор IsBxHookUserId при transform.
        expect(data).toEqual({
            ...base,
            responsible: 447,
            created: 1,
            force: EnumColdCallForce.N,
        });
    });
});
