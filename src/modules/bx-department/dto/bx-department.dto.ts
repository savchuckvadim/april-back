import { EDepartamentGroup } from "@/modules/portal/interfaces/portal.interface";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";

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
        required: true
    })
    @IsEnum(EClients)
    domain: EClients;
}

export class BxDepartmentDto {
    @ApiProperty({
        enum: EClients,
        description: 'Domain of the Bitrix24 portal',
        example: EClients.april,
        required: true
    })
    @IsEnum(EClients)
    domain: EClients;

    @ApiProperty({
        enum: EDepartamentGroup,
        description: 'Department group to filter by',
        example: EDepartamentGroup.sales,
        required: false
    })
    @IsEnum(EDepartamentGroup)
    @IsOptional()
    department?: EDepartamentGroup;
}
