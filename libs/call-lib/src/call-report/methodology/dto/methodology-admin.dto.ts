import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
    METHODOLOGY_SCOPES,
    METHODOLOGY_SOURCES,
    type MethodologyScope,
    type MethodologySource,
} from '../methodology.types';
import type { MethodologyOption } from '../methodology-registry.service';

/** Параметры списка методик для портала. */
export class MethodologyListQueryDto {
    @ApiPropertyOptional({
        description:
            'Домен портала: в список попадают его собственные методики ' +
            'поверх общих. Пусто — только общий слой.',
        example: 'gsr.bitrix24.ru',
        type: String,
        maxLength: 255,
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    domain?: string;
}

/** Методика в списке выбора: сводка без полного конфига. */
export class MethodologyOptionDto implements MethodologyOption {
    @ApiProperty({
        description:
            'Код методики — значение настройки портала methodologyCode.',
        example: 'polyansky',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название для формы и карточки разбора.',
        example: 'Полянский',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Версия конфига; меняется при правке пунктов.',
        example: '1.0.0',
        type: String,
    })
    version: string;

    @ApiProperty({
        description:
            'Слой: common — общая методика April, portal — своя методика портала.',
        enum: METHODOLOGY_SCOPES,
        example: 'common',
    })
    scope: MethodologyScope;

    @ApiProperty({
        description:
            'Откуда конфиг: builtin — встроенный в код, table — строка таблицы методик.',
        enum: METHODOLOGY_SOURCES,
        example: 'builtin',
    })
    source: MethodologySource;

    @ApiProperty({
        description: 'Типы звонков, к которым методика применяется.',
        example: [
            'cold',
            'call',
            'presentation',
            'refine',
            'decision',
            'payment',
        ],
        type: [String],
    })
    types: string[];

    @ApiProperty({
        description: 'Число чек-пунктов в конфиге.',
        example: 36,
        type: Number,
    })
    checkpoints: number;

    @ApiProperty({
        description: 'Число ограничителей оценки в конфиге.',
        example: 12,
        type: Number,
    })
    caps: number;

    @ApiProperty({
        description: 'Считаются ли спирали презентации.',
        example: true,
        type: Boolean,
    })
    spiralsEnabled: boolean;
}

/** Список методик, доступных порталу. */
export class MethodologyListDto {
    @ApiProperty({
        description:
            'Домен, для которого собран список; null — только общий слой.',
        example: 'gsr.bitrix24.ru',
        type: String,
        nullable: true,
    })
    domain: string | null;

    @ApiProperty({
        description: 'Методики по алфавиту названий.',
        type: [MethodologyOptionDto],
    })
    options: MethodologyOptionDto[];
}
