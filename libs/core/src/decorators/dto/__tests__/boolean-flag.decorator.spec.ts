import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { createGlobalValidationPipe } from '../../../bootstrap/global-validation-pipe';
import { IsBooleanFlag, parseBooleanish } from '../boolean-flag.decorator';

/** Флаг через общий помощник. */
class FlagDto {
    @IsOptional()
    @IsBooleanFlag()
    flag?: boolean;
}

/** Прежний приём DTO AI-аналитики: @Transform по `value` + @IsBoolean. */
class OldTransformDto {
    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        value === 'true' ? true : value === 'false' ? false : value,
    )
    @IsBoolean()
    flag?: boolean;
}

const pipe = createGlobalValidationPipe();

const parse = async <T extends object>(
    metatype: new () => T,
    flag: unknown,
): Promise<T> =>
    (await pipe.transform({ flag }, { type: 'query', metatype })) as T;

describe('IsBooleanFlag под глобальным ValidationPipe', () => {
    it.each([
        ['false', false],
        ['true', true],
        [' FALSE ', false],
        ['0', false],
        ['1', true],
        ['', false],
        [false, false],
        [true, true],
    ])('%p → %p', async (value, expected) => {
        expect((await parse(FlagDto, value)).flag).toBe(expected);
    });

    it('нераспознанное — 400, не молчаливое true', async () => {
        await expect(parse(FlagDto, 'ага')).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('не передан — остаётся пустым', async () => {
        const dto = (await pipe.transform(
            {},
            { type: 'query', metatype: FlagDto },
        )) as FlagDto;
        expect(dto.flag).toBeUndefined();
    });

    it('почему нужен помощник: прежний @Transform по value получает уже приведённое true', async () => {
        expect((await parse(OldTransformDto, 'false')).flag).toBe(true);
    });

    it('разбор строк сам по себе', () => {
        expect(parseBooleanish({ value: 'off' })).toBe(false);
        expect(parseBooleanish({ value: 'yes' })).toBe(true);
        expect(parseBooleanish({ value: 2 })).toBe(2);
    });
});
