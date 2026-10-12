import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { parseBooleanish } from '../dto/contract-template.boolean.transform';
import {
    ContractTemplateActiveDto,
    ContractTemplateDefaultDto,
} from '../dto/contract-template-patch-flags.dto';
import { ContractTemplateQueryDto } from '../dto/contract-template-query.dto';

/**
 * Регрессия на приведение булевых полей.
 *
 * Поля были объявлены через `@Type(() => Boolean)`, то есть через
 * конструктор `Boolean(value)`: для любой непустой строки он даёт `true`,
 * поэтому `'false'` превращался в `true`. Из HTTP булевы значения приходят
 * именно строками (query-строка и multipart/form-data типов не имеют), так
 * что ручки отрабатывали РОВНО НАОБОРОТ, и валидация при этом молчала —
 * к моменту `@IsBoolean()` значение уже было настоящим булевым.
 *
 * Опции `plainToInstance` здесь повторяют глобальный ValidationPipe из
 * `libs/core/src/bootstrap/bootstrap-app.ts`
 * (`whitelist: true`, `enableImplicitConversion: true`).
 */
const PIPE_TRANSFORM = { enableImplicitConversion: true } as const;
const PIPE_VALIDATE = {
    whitelist: true,
    forbidNonWhitelisted: false,
    forbidUnknownValues: false,
} as const;

describe('parseBooleanish', () => {
    it.each([
        ['false', false],
        ['FALSE', false],
        [' false ', false],
        ['0', false],
        ['no', false],
        ['off', false],
        ['yes', true],
        ['on', true],
        ['true', true],
        ['TRUE', true],
        ['1', true],
        [false, false],
        [true, true],
        [0, false],
        [1, true],
    ])('%p → %p', (input, expected) => {
        expect(parseBooleanish({ value: input })).toBe(expected);
    });

    it('пустая строка из multipart — «поле не заполнено» → false', () => {
        expect(parseBooleanish({ value: '' })).toBe(false);
    });

    it('null и undefined проходят как есть', () => {
        expect(parseBooleanish({ value: null })).toBeNull();
        expect(parseBooleanish({ value: undefined })).toBeUndefined();
    });

    it('мусор не превращается в true: пусть падает @IsBoolean', () => {
        // Распознаются только словари TRUE_VALUES / FALSE_VALUES
        // (true/false/1/0/yes/no/on/off). Всё остальное возвращается как
        // есть, чтобы отказ выдал @IsBoolean внятным 400, а не молчаливый
        // true.
        expect(parseBooleanish({ value: '1x' })).toBe('1x');
        expect(parseBooleanish({ value: 'ага' })).toBe('ага');
        expect(parseBooleanish({ value: 'truthy' })).toBe('truthy');
    });
});

describe('PATCH-флаги: строка "false" выключает, а не включает', () => {
    it('is_active="false" → false (раньше было true)', () => {
        const dto = plainToInstance(
            ContractTemplateActiveDto,
            { is_active: 'false' },
            PIPE_TRANSFORM,
        );
        expect(validateSync(dto, PIPE_VALIDATE)).toHaveLength(0);
        expect(dto.is_active).toBe(false);
    });

    it('is_active="true" → true', () => {
        const dto = plainToInstance(
            ContractTemplateActiveDto,
            { is_active: 'true' },
            PIPE_TRANSFORM,
        );
        expect(validateSync(dto, PIPE_VALIDATE)).toHaveLength(0);
        expect(dto.is_active).toBe(true);
    });

    it('is_default="false" → false: иначе снялся бы флаг у всей области', () => {
        const dto = plainToInstance(
            ContractTemplateDefaultDto,
            { is_default: 'false' },
            PIPE_TRANSFORM,
        );
        expect(validateSync(dto, PIPE_VALIDATE)).toHaveLength(0);
        expect(dto.is_default).toBe(false);
    });

    it('мусор вместо флага даёт 400, а не молчаливый true', () => {
        const dto = plainToInstance(
            ContractTemplateActiveDto,
            { is_active: 'ага' },
            PIPE_TRANSFORM,
        );
        const errors = validateSync(dto, PIPE_VALIDATE);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('is_active');
    });
});

describe('query-строка: ?is_archived=false больше не отдаёт архивные', () => {
    it('is_archived="false" → false', () => {
        const dto = plainToInstance(
            ContractTemplateQueryDto,
            { is_archived: 'false' },
            PIPE_TRANSFORM,
        );
        expect(validateSync(dto, PIPE_VALIDATE)).toHaveLength(0);
        expect(dto.is_archived).toBe(false);
    });

    it('is_archived="true" → true', () => {
        const dto = plainToInstance(
            ContractTemplateQueryDto,
            { is_archived: 'true' },
            PIPE_TRANSFORM,
        );
        expect(validateSync(dto, PIPE_VALIDATE)).toHaveLength(0);
        expect(dto.is_archived).toBe(true);
    });

    it('is_active="false" и only_common="false" тоже не инвертируются', () => {
        const dto = plainToInstance(
            ContractTemplateQueryDto,
            { is_active: 'false', only_common: 'false' },
            PIPE_TRANSFORM,
        );
        expect(validateSync(dto, PIPE_VALIDATE)).toHaveLength(0);
        expect(dto.is_active).toBe(false);
        expect(dto.only_common).toBe(false);
    });
});
