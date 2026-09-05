import { BXUserDto } from './bx-user.dto';
import { IBXDepartment } from '@/modules/bitrix/domain/interfaces/bitrix.interface';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export enum EClients {
    dev = 'april-dev.bitrix24.ru',
    april = 'april-garant.bitrix24.ru',
    gsr = 'gsr.bitrix24.ru',
    gsirk = 'gsirk.bitrix24.ru',
    alfacentr = 'alfacentr.bitrix24.ru',
    garantservisvoronezh = 'garantservisvoronezh.bitrix24.ru',
}

export class DomaintDto {
    @ApiProperty({
        enum: EClients,
        description: 'Domain of the Bitrix24 portal',
        example: EClients.dev,
        required: true,
    })
    @IsEnum(EClients)
    domain: EClients;
}

export class BxDepartmentRequestDto {
    @ApiProperty({
        enum: EClients,
        description: 'Domain of the Bitrix24 portal',
        example: EClients.april,
        required: true,
    })
    @IsEnum(EClients)
    domain: EClients;

    @ApiProperty({
        enum: EDepartamentGroup,
        description: 'Department group to filter by',
        example: EDepartamentGroup.sales,
        required: false,
    })
    @IsEnum(EDepartamentGroup)
    @IsOptional()
    department?: EDepartamentGroup;

    @ApiProperty({
        description:
            'Сбросить кэш Redis перед запросом: данные будут заново получены из Битрикс и закэшированы.',
        type: Boolean,
        example: false,
        required: false,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    resetCache?: boolean;
}

export class BxDepartmentDto implements IBXDepartment {
    @ApiProperty({
        description: 'Department ID',
        example: 1,
        required: true,
    })
    ID: number;

    @ApiProperty({
        description: 'Department name',
        example: 'Sales',
        required: true,
    })
    NAME: string;

    @ApiProperty({
        description: 'Department parent',
        example: 1,
        required: true,
    })
    PARENT: string;

    @ApiProperty({
        description: 'Department sort',
        example: 1,
        required: true,
    })
    SORT: number;

    @ApiProperty({
        description: 'Department users',
        type: [BXUserDto],
        required: true,
    })
    USERS: BXUserDto[];

    @ApiProperty({
        description:
            'Руководитель отдела (user id). Битрикс отдаёт строкой/числом — ' +
            'сервис нормализует к числу; 0/пусто → null.',
        type: Number,
        nullable: true,
        example: 447,
    })
    UF_HEAD?: number | null;

    @ApiProperty({
        description:
            'Руководители отдела (user id): руководитель первым, потом ' +
            'заместители. Собирается из новой структуры компании ' +
            '(REST 3.0, роли участников узла) и легаси UF_HEAD; пустой ' +
            'список — руководителя нет. UF_HEAD = первый элемент.',
        type: [Number],
        example: [447, 448],
    })
    HEADS: number[];
}
export class BxDepartmentDataDto {
    @ApiProperty({
        description: 'Department ID',
        example: 1,
        required: true,
    })
    department: number;

    @ApiProperty({
        description: 'General department',
        example: [BxDepartmentDto],
        required: true,
        type: [BxDepartmentDto],
    })
    generalDepartment: BxDepartmentDto[];

    @ApiProperty({
        description: 'Children departments',
        example: [BxDepartmentDto],
        required: true,
        type: [BxDepartmentDto],
    })
    childrenDepartments: BxDepartmentDto[];

    @ApiPropertyOptional({
        description:
            'Родительские отделы базового (климб по PARENT до 3 уровней, ' +
            'с сотрудниками) — для честного «вышестоящего» без хардкода bossId.',
        type: [BxDepartmentDto],
    })
    parentDepartments?: BxDepartmentDto[];

    @ApiProperty({
        description: 'All users',
        example: [BXUserDto],
        required: true,
        type: [BXUserDto],
    })
    allUsers: BXUserDto[];
}

export class BxDepartmentResponseDto {
    @ApiProperty({
        description: 'Department data',
        example: BxDepartmentDataDto,
        required: true,
    })
    @Type(() => BxDepartmentDataDto)
    department: BxDepartmentDataDto;
}
