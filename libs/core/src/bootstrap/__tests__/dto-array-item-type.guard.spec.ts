import * as path from 'path';
import {
    auditDtoArrayItemTypes,
    DtoArrayItemTypeFinding,
} from '../dto-array-item-type.audit';

/**
 * Страж: во входных DTO нет массивов объектов без `@Type`.
 *
 * При глобальном `enableImplicitConversion` такой массив приходит в сервис
 * массивом массивов (400 от `@IsObject({ each: true })` или молча `[[]]`
 * после JSON.stringify). Чинить: `@IsObjectArray()` для объектов свободной
 * формы либо `@ValidateNested({ each: true }) @Type(() => ItemDto)`.
 */
const ROOT = path.resolve(__dirname, '../../../../..');
const FIXTURE = path.join(__dirname, 'audit-fixture.controller.ts');

const FIXTURE_SOURCE = `
import { Body, Controller, Post, Query } from '@nestjs/common';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { IsObjectArray } from '../../decorators/dto/object-array.decorator';

enum Color { Red = 'red' }
interface FreeItem { name: string }
class ItemDto { @IsString() name: string; }

class InnerDto {
    @IsArray() @IsObject({ each: true }) nestedBad: FreeItem[];
}

class BodyDto {
    @IsArray() @IsObject({ each: true }) bad: FreeItem[];
    @IsArray() onlyArray: Array<Record<string, unknown>>;
    @IsOptional() @IsArray() anyItems?: any[] | null;
    @IsObjectArray() good: FreeItem[];
    @IsArray() @Type(() => Object) goodRaw: unknown[];
    @IsArray() @ValidateNested({ each: true }) @Type(() => ItemDto) goodNested: ItemDto[];
    @IsString({ each: true }) strings: string[];
    @IsEnum(Color, { each: true }) colors: Color[];
    @ApiProperty() strippedByWhitelist: FreeItem[];
    @ValidateNested() @Type(() => InnerDto) inner: InnerDto;
    @IsObject() notWhitelisted: InnerDto;
}

class UpdateBodyDto extends PartialType(BodyDto) {}

class QueryDto {
    @IsOptional() @IsArray() filters?: FreeItem[];
}

@Controller('fixture')
export class AuditFixtureController {
    @Post() create(@Body() body: BodyDto) { return body; }
    @Post('update') update(@Body() body: UpdateBodyDto) { return body; }
    @Post('search') search(@Query() query: QueryDto) { return query; }
}
`;

const describeFinding = (f: DtoArrayItemTypeFinding) =>
    `${f.location}  ${f.className}.${f.property}: ${f.declaredType}\n` +
    f.routes.map(r => `    ← ${r}`).join('\n');

describe('DTO: массивы объектов без @Type (enableImplicitConversion)', () => {
    it('аудит находит ровно опасные свойства в образце', () => {
        const { findings, entryPoints } = auditDtoArrayItemTypes({
            root: ROOT,
            entryFiles: [FIXTURE],
            virtualFiles: { [FIXTURE]: FIXTURE_SOURCE },
        });

        expect(entryPoints).toBe(3);
        expect(
            findings.map(f => `${f.className}.${f.property}`).sort(),
        ).toEqual([
            'BodyDto.anyItems',
            'BodyDto.bad',
            'BodyDto.onlyArray',
            'InnerDto.nestedBad',
            'QueryDto.filters',
        ]);
        expect(
            findings.find(f => f.property === 'anyItems')?.elementIsObject,
        ).toBe('maybe');
    });

    it('во всех контроллерах бэка таких свойств нет', () => {
        const { findings, entryPoints } = auditDtoArrayItemTypes({
            root: ROOT,
        });

        // защита от «аудит ничего не нашёл, потому что ничего не просмотрел»
        expect(entryPoints).toBeGreaterThan(300);
        if (findings.length) {
            throw new Error(
                'Массив объектов без @Type во входном DTO — при ' +
                    'enableImplicitConversion элементы станут Array. ' +
                    'Поставьте @IsObjectArray() (libs/core/src/decorators/dto/' +
                    'object-array.decorator.ts) или @ValidateNested + @Type(() => ItemDto):\n' +
                    findings.map(describeFinding).join('\n'),
            );
        }
    });
});
