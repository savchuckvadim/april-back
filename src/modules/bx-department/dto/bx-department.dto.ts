import { BXUserDto } from '@/apps/kpi-report-ork/event/dto/get-report-request.dto';
import { IBXDepartment } from '@/modules/bitrix/domain/interfaces/bitrix.interface';
import { EDepartamentGroup } from '@/modules/portal/interfaces/portal.interface';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional } from 'class-validator';

export enum EClients {
    dev = 'april-dev.bitrix24.ru',
    april = 'april-garant.bitrix24.ru',
    gsr = 'gsr.bitrix24.ru',
    gsirk = 'gsirk.bitrix24.ru',
    alfacentr = 'alfacentr.bitrix24.ru',
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
        example: [BXUserDto],
        required: true,
    })

    USERS: BXUserDto[];

    @ApiProperty({
        description: 'Department head',
        example: 1,
        required: true,
    })

    UF_HEAD?: number | undefined;

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
        required: true, type: [BxDepartmentDto],
    })
    generalDepartment: BxDepartmentDto[];

    @ApiProperty({
        description: 'Children departments',
        example: [BxDepartmentDto],
        required: true,
        type: [BxDepartmentDto],
    })
    childrenDepartments: BxDepartmentDto[];

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
