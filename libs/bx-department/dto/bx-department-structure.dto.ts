import { BXUserDto } from './bx-user.dto';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import {
    BxDepartmentDataDto,
    BxDepartmentDto,
    EClients,
} from './bx-department.dto';

/** Уровень руководства текущего пользователя в структуре продаж. */
export enum EBxDepartmentHeadType {
    /** Руководитель над отделами продаж (родительский отдел ОП). */
    cup = 'cup',
    /** Руководитель отдела продаж (ОП). */
    op = 'op',
    /** Руководитель группы внутри ОП. */
    group = 'group',
}

export class BxDepartmentStructureRequestDto {
    @ApiProperty({
        enum: EClients,
        description: 'Домен портала Битрикс24.',
        example: EClients.garantservisvoronezh,
        required: true,
    })
    @IsEnum(EClients)
    domain: EClients;

    @ApiProperty({
        enum: EDepartamentGroup,
        description:
            'Группа отделов: sales — отделы продаж, service — отделы сервиса.',
        example: EDepartamentGroup.sales,
        required: false,
        default: EDepartamentGroup.sales,
    })
    @IsOptional()
    @IsEnum(EDepartamentGroup)
    department?: EDepartamentGroup;

    @ApiProperty({
        description: 'Идентификатор текущего пользователя Битрикс24.',
        type: Number,
        example: 447,
        required: true,
    })
    @IsInt()
    @Min(1)
    userId: number;

    @ApiProperty({
        description:
            'Сбросить кэш Redis перед запросом: структура будет заново получена из Битрикс и закэширована.',
        type: Boolean,
        example: false,
        required: false,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    resetCache?: boolean;
}

export class BxSalesDepartmentDto {
    @ApiProperty({
        description: 'Отдел продаж (ОП) с его сотрудниками.',
        type: BxDepartmentDto,
    })
    @ValidateNested()
    @Type(() => BxDepartmentDto)
    department: BxDepartmentDto;

    @ApiProperty({
        description:
            'Группы внутри ОП с сотрудниками. Пустой массив, если в ОП нет групп — сотрудники числятся прямо в отделе.',
        type: [BxDepartmentDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BxDepartmentDto)
    groups: BxDepartmentDto[];

    @ApiProperty({
        description: 'Все сотрудники ОП: из самого отдела и всех его групп.',
        type: [BXUserDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BXUserDto)
    allUsers: BXUserDto[];
}

export class BxCurrentUserColleaguesDto {
    @ApiProperty({
        description:
            'Текущие сотрудники группы пользователя (без него самого). Пустой массив, если пользователь не состоит в группе.',
        type: [BXUserDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BXUserDto)
    group: BXUserDto[];

    @ApiProperty({
        description:
            'Текущие сотрудники ОП пользователя, включая все группы отдела (без него самого).',
        type: [BXUserDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BXUserDto)
    department: BXUserDto[];
}

export class BxCurrentUserDto {
    @ApiProperty({
        description: 'Идентификатор текущего пользователя.',
        type: Number,
        example: 447,
    })
    @IsInt()
    @Min(1)
    userId: number;

    @ApiProperty({
        description: 'Является ли пользователь руководителем в структуре.',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    isHead: boolean;

    @ApiProperty({
        enum: EBxDepartmentHeadType,
        description:
            'Чем руководит: cup — всеми отделами продаж (родительский отдел), op — отделом продаж, group — группой. null — не руководитель.',
        example: EBxDepartmentHeadType.op,
        nullable: true,
    })
    @ValidateIf((dto: BxCurrentUserDto) => dto.headOf !== null)
    @IsEnum(EBxDepartmentHeadType)
    headOf: EBxDepartmentHeadType | null;

    @ApiProperty({
        description:
            'Идентификаторы отделов, которыми руководит пользователь (на уровне headOf).',
        type: [Number],
        example: [37],
    })
    @IsArray()
    @IsInt({ each: true })
    headOfDepartmentIds: number[];

    @ApiProperty({
        description: 'Коллеги текущего пользователя.',
        type: BxCurrentUserColleaguesDto,
    })
    @ValidateNested()
    @Type(() => BxCurrentUserColleaguesDto)
    colleagues: BxCurrentUserColleaguesDto;
}

export class BxDepartmentStructureResponseDto {
    @ApiProperty({
        description:
            'Мультирежим портала: отделы продаж собраны по тэгу со всей структуры (departaments.is_multiple в БД). false — один базовый отдел.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    isMultiple: boolean;

    @ApiProperty({
        description:
            'Тэг поиска отделов в мультирежиме (departaments.multiple_tag), null — тэг не задан.',
        type: String,
        example: 'ОП ОС',
        nullable: true,
    })
    @ValidateIf(
        (dto: BxDepartmentStructureResponseDto) => dto.multipleTag !== null,
    )
    @IsString()
    multipleTag: string | null;

    @ApiProperty({
        description:
            'Структура в прежнем формате. В мультирежиме отделы продаж смерджены: generalDepartment — все найденные ОП, childrenDepartments — все их группы, allUsers — все сотрудники; поле department = 0 (единого корневого id нет).',
        type: BxDepartmentDataDto,
    })
    @ValidateNested()
    @Type(() => BxDepartmentDataDto)
    department: BxDepartmentDataDto;

    @ApiProperty({
        description: 'Новая структура: разбивка по отделам продаж.',
        type: [BxSalesDepartmentDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BxSalesDepartmentDto)
    salesDepartments: BxSalesDepartmentDto[];

    @ApiProperty({
        description: 'Информация о текущем пользователе: роль и коллеги.',
        type: BxCurrentUserDto,
    })
    @ValidateNested()
    @Type(() => BxCurrentUserDto)
    currentUser: BxCurrentUserDto;
}
