import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";


export enum EClients {
    dev='april-dev.bitrix24.ru',
    april='april-garant.bitrix24.ru',
    gsr='gsr.bitrix24.ru',
    gsirk='gsirk.bitrix24.ru',
    alfacentr='alfacentr.bitrix24.ru',

}

export class DomainDto {
    @IsEnum(EClients)
    @ApiProperty({ enum: EClients }) // для отображения в Swagger
    domain: EClients
}
