import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import {
    LIBRARY_KINDS,
    LIBRARY_VISIBILITIES,
    LibraryKind,
    LibraryVisibility,
} from '../lib/library-visibility.util';
import { InnerDealSnapshotDto } from './inner-deal.dto';

/**
 * Библиотека заготовок конструктора: избранное и акции в bx_document_deals
 * (решение владельца 12). Слепок — тот же формат, что у сделки; здесь только
 * адрес (kind/visibility/title) и права.
 */

export class InnerDealLibraryQueryDto {
    @ApiProperty({ type: String, example: 'gsr.bitrix24.ru' })
    @IsNotEmpty()
    @IsString()
    domain: string;

    @ApiProperty({ type: Number, example: 447, description: 'Пользователь Bitrix, кто спрашивает' })
    @IsInt()
    @Type(() => Number)
    userId: number;

    @ApiProperty({ enum: LIBRARY_KINDS, required: false, description: 'Без kind — и избранное, и акции' })
    @IsOptional()
    @IsIn(LIBRARY_KINDS)
    kind?: LibraryKind;
}

export class InnerDealLibraryActorQueryDto {
    @ApiProperty({ type: String, example: 'gsr.bitrix24.ru' })
    @IsNotEmpty()
    @IsString()
    domain: string;

    @ApiProperty({ type: Number, example: 447 })
    @IsInt()
    @Type(() => Number)
    userId: number;
}

/** Слепок конструктора для заготовки — те же payload-колонки, что в upsert сделки. */
export class InnerDealLibrarySnapshotDto {
    @ApiProperty({ type: Number, required: false, nullable: true })
    @IsOptional()
    @IsInt()
    templateId?: number | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    dealName?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    app?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    global?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    currentComplect?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    od?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    result?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    contract?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    product?: string | null;

    @ApiProperty({
        type: String,
        required: false,
        nullable: true,
        description: 'Слепок v2 (JSON, schemaVersion 2) или легаси rows',
    })
    @IsOptional()
    @IsString()
    rows?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    regions?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    iskraConfig?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    ltOther?: string | null;
}

export class InnerDealLibraryCreateDto {
    @ApiProperty({ type: String, example: 'gsr.bitrix24.ru' })
    @IsNotEmpty()
    @IsString()
    domain: string;

    @ApiProperty({ type: Number, example: 447, description: 'Автор заготовки' })
    @IsInt()
    @Type(() => Number)
    userId: number;

    @ApiProperty({ enum: LIBRARY_KINDS })
    @IsIn(LIBRARY_KINDS)
    kind: LibraryKind;

    @ApiProperty({
        enum: LIBRARY_VISIBILITIES,
        description:
            'Сотрудник — user; руководитель/суперпользователь — user|department|portal; global — только админка',
    })
    @IsIn(LIBRARY_VISIBILITIES)
    visibility: LibraryVisibility;

    @ApiProperty({ type: String, example: 'Бухгалтер + LT для ИП' })
    @IsNotEmpty()
    @IsString()
    @MaxLength(255)
    title: string;

    @ApiProperty({ type: InnerDealLibrarySnapshotDto })
    @ValidateNested()
    @Type(() => InnerDealLibrarySnapshotDto)
    snapshot: InnerDealLibrarySnapshotDto;
}

export class InnerDealLibraryPatchDto {
    @ApiProperty({ type: String, example: 'gsr.bitrix24.ru' })
    @IsNotEmpty()
    @IsString()
    domain: string;

    @ApiProperty({ type: Number, example: 447, description: 'Кто правит' })
    @IsInt()
    @Type(() => Number)
    userId: number;

    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    title?: string;

    @ApiProperty({ enum: LIBRARY_VISIBILITIES, required: false })
    @IsOptional()
    @IsIn(LIBRARY_VISIBILITIES)
    visibility?: LibraryVisibility;

    @ApiProperty({ type: Boolean, required: false, description: 'Архив скрывает заготовку у всех, история сделок остаётся' })
    @IsOptional()
    @IsBoolean()
    isArchived?: boolean;
}

/** Строка библиотеки без тяжёлого слепка — для списков. */
export class InnerDealLibraryItemDto {
    @ApiProperty({ type: Number })
    id: number;

    @ApiProperty({ enum: LIBRARY_KINDS })
    kind: LibraryKind;

    @ApiProperty({ enum: LIBRARY_VISIBILITIES })
    visibility: LibraryVisibility;

    @ApiProperty({ type: String, nullable: true })
    title: string | null;

    @ApiProperty({ type: String, nullable: true, description: 'Имя сделки-источника (легаси-избранное без title)' })
    dealName: string | null;

    @ApiProperty({ type: Number, nullable: true, description: 'Автор (Bitrix user id)' })
    authorId: number | null;

    @ApiProperty({ type: String, nullable: true, description: 'Отдел продаж автора (id Bitrix) для visibility=department' })
    departmentId: string | null;

    @ApiProperty({ type: Boolean, description: 'Текущий пользователь может переименовать/сменить видимость/удалить' })
    canEdit: boolean;

    @ApiProperty({ type: Boolean })
    isArchived: boolean;

    @ApiProperty({ type: String, nullable: true, format: 'date-time' })
    createdAt: string | null;

    @ApiProperty({ type: String, nullable: true, format: 'date-time' })
    updatedAt: string | null;
}

/** Что текущему пользователю можно в библиотеке — для формы «Сохранить в избранное». */
export class InnerDealLibraryRightsDto {
    @ApiProperty({ type: Boolean })
    isHead: boolean;

    @ApiProperty({ type: Boolean })
    isSuperUser: boolean;

    @ApiProperty({ type: Number, nullable: true })
    departmentId: number | null;

    @ApiProperty({ enum: LIBRARY_VISIBILITIES, isArray: true })
    favoriteVisibilities: LibraryVisibility[];

    @ApiProperty({ enum: LIBRARY_VISIBILITIES, isArray: true })
    promotionVisibilities: LibraryVisibility[];
}

export class InnerDealLibraryDeleteResponseDto {
    @ApiProperty({ type: Boolean })
    deleted: boolean;
}

export { InnerDealSnapshotDto };
