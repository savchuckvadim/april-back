import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsIn,
    IsObject,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from 'class-validator';
import {
    METHODOLOGY_CODE_PATTERN,
    METHODOLOGY_SCOPES,
    METHODOLOGY_SOURCES,
    type MethodologyScope,
    type MethodologySource,
} from '../methodology.types';
import type {
    MethodologyDetail,
    MethodologyListItem,
    MethodologyValidation,
} from '../methodology-admin.service';
import { MethodologyConfigDto } from './methodology-config.dto';

/** Параметры списка строк методик. */
export class MethodologyItemsQueryDto {
    @ApiPropertyOptional({
        description:
            'Домен портала: в список попадают его собственные методики ' +
            'поверх общих; пусто — только общий слой.',
        example: 'gsr.bitrix24.ru',
        type: String,
        maxLength: 255,
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    domain?: string;
}

/** Параметры карточки: строка по id либо встроенная по коду. */
export class MethodologyDetailQueryDto {
    @ApiPropertyOptional({
        description:
            'uuid строки таблицы; пусто — встроенная методика по коду.',
        example: '7f6a1c2e-0000-4000-8000-000000000007',
        type: String,
        maxLength: 36,
    })
    @IsOptional()
    @IsString()
    @MaxLength(36)
    id?: string;

    @ApiPropertyOptional({
        description: 'Код встроенной методики, когда id не задан.',
        example: 'polyansky',
        type: String,
    })
    @IsOptional()
    @IsString()
    @Matches(METHODOLOGY_CODE_PATTERN)
    code?: string;
}

/** Строка списка методик. */
export class MethodologyListItemDto implements MethodologyListItem {
    @ApiProperty({
        description: 'uuid строки таблицы; null — встроенная методика кода.',
        example: '7f6a1c2e-0000-4000-8000-000000000007',
        type: String,
        nullable: true,
    })
    id: string | null;

    @ApiProperty({
        description: 'Код методики.',
        example: 'polyansky',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название.',
        example: 'Полянский',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Версия конфига.',
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
        description: 'Домен портала у своей методики; null у общего слоя.',
        example: 'gsr.bitrix24.ru',
        type: String,
        nullable: true,
    })
    portalDomain: string | null;

    @ApiProperty({
        description:
            'Откуда конфиг: builtin — встроен в код, table — строка таблицы.',
        enum: METHODOLOGY_SOURCES,
        example: 'table',
    })
    source: MethodologySource;

    @ApiProperty({
        description:
            'Выключенная методика не предлагается порталам и не применяется.',
        example: true,
        type: Boolean,
    })
    isActive: boolean;

    @ApiProperty({
        description: 'Когда менялась строка; null у встроенной.',
        example: '2026-11-01T10:00:00.000Z',
        type: String,
        format: 'date-time',
        nullable: true,
    })
    updatedAt: Date | null;

    @ApiProperty({
        description: 'Кто менял (логин администратора); null у встроенной.',
        example: 'vadim',
        type: String,
        nullable: true,
    })
    updatedBy: string | null;

    @ApiProperty({
        description:
            'Конфиг строки проходит проверку; у встроенной всегда true.',
        example: true,
        type: Boolean,
    })
    valid: boolean;

    @ApiProperty({
        description: 'Число чек-пунктов.',
        example: 36,
        type: Number,
    })
    checkpoints: number;

    @ApiProperty({
        description: 'Число ограничителей.',
        example: 12,
        type: Number,
    })
    caps: number;
}

/** Список строк методик. */
export class MethodologyItemsDto {
    @ApiProperty({
        description:
            'Домен, для которого собран список; null — только общий слой.',
        example: 'gsr.bitrix24.ru',
        type: String,
        nullable: true,
    })
    domain: string | null;

    @ApiProperty({
        description: 'Строки: сначала общий слой, затем свои методики портала.',
        type: [MethodologyListItemDto],
    })
    items: MethodologyListItemDto[];
}

/** Карточка методики для формы: строка плюс конфиг и ошибки проверки. */
export class MethodologyDetailDto
    extends MethodologyListItemDto
    implements MethodologyDetail
{
    @ApiProperty({
        description:
            'Конфиг методики (объект Methodology из call-lib: code, title, ' +
            'version, types, principles, checkpoints, caps, spirals, ' +
            'sectionAnchors, relevance, knowledge). Форма правит его целиком.',
        type: MethodologyConfigDto,
    })
    config: MethodologyDetail['config'];

    @ApiProperty({
        description:
            'Ошибки проверки конфига строки по-русски; пусто — валиден.',
        example: [],
        type: [String],
    })
    errors: string[];

    @ApiProperty({
        description: 'Метка версии «код@версия» — так она пишется в разборы.',
        example: 'polyansky@1.0.0',
        type: String,
    })
    versionTag: string;
}

/** Конфиг на проверку. */
export class MethodologyValidateDto {
    @ApiProperty({
        description: 'Конфиг методики как объект (тот же, что в карточке).',
        type: MethodologyConfigDto,
    })
    @IsObject()
    config: Record<string, unknown>;
}

/** Сводка валидного конфига. */
export class MethodologyValidationSummaryDto {
    @ApiProperty({
        description: 'Код методики.',
        example: 'garant-own',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название.',
        example: 'Своя методика',
        type: String,
    })
    title: string;

    @ApiProperty({ description: 'Версия.', example: '1.0.0', type: String })
    version: string;

    @ApiProperty({
        description: 'Типы звонков методики.',
        example: ['presentation'],
        type: [String],
    })
    types: string[];

    @ApiProperty({
        description: 'Число чек-пунктов.',
        example: 5,
        type: Number,
    })
    checkpoints: number;

    @ApiProperty({
        description: 'Число ограничителей.',
        example: 2,
        type: Number,
    })
    caps: number;

    @ApiProperty({
        description: 'Считаются ли спирали.',
        example: false,
        type: Boolean,
    })
    spiralsEnabled: boolean;
}

/** Итог проверки конфига. */
export class MethodologyValidationDto implements MethodologyValidation {
    @ApiProperty({
        description: 'Конфиг валиден.',
        example: true,
        type: Boolean,
    })
    ok: boolean;

    @ApiProperty({
        description: 'Все ошибки сразу, по-русски, с путём до поля.',
        example: ['checkpoints[0].title: нужна формулировка пункта'],
        type: [String],
    })
    errors: string[];

    @ApiProperty({
        description: 'Сводка валидного конфига; null при ошибках.',
        type: MethodologyValidationSummaryDto,
        nullable: true,
    })
    summary: MethodologyValidationSummaryDto | null;
}

/** Сохранение строки методики (создание при пустом id). */
export class MethodologySaveDto {
    @ApiPropertyOptional({
        description: 'uuid строки для правки; пусто — создать новую.',
        example: '7f6a1c2e-0000-4000-8000-000000000007',
        type: String,
        nullable: true,
        maxLength: 36,
    })
    @IsOptional()
    @IsString()
    @MaxLength(36)
    id?: string | null;

    @ApiProperty({
        description:
            'Слой: common — общая методика April, portal — своя методика портала (нужен portalDomain).',
        enum: METHODOLOGY_SCOPES,
        example: 'portal',
    })
    @IsString()
    @IsIn(METHODOLOGY_SCOPES)
    scope: MethodologyScope;

    @ApiPropertyOptional({
        description:
            'Домен портала для своей методики; у общего слоя не нужен.',
        example: 'gsr.bitrix24.ru',
        type: String,
        nullable: true,
        maxLength: 255,
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    portalDomain?: string | null;

    @ApiProperty({
        description:
            'Включена ли методика (выключенная не предлагается и не применяется).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    isActive: boolean;

    @ApiProperty({
        description:
            'Конфиг методики как объект; code, title и version берутся из него.',
        type: MethodologyConfigDto,
    })
    @IsObject()
    config: Record<string, unknown>;
}
