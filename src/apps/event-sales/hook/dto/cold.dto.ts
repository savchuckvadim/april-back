import { Type } from "class-transformer"
import { IsString, ValidateNested } from "class-validator"

export class ColdCallQueryDto {

    @IsString()
    entityType: string
    @IsString()
    entityId: string
    @IsString()
    responsible: string
    @IsString()
    created: string
    @IsString()
    deadline: string
    @IsString()
    name: string
    isTmc: "Y" | "N"
}

export class ColdCallBodyDto {

    @ValidateNested()
    @Type(() => ColdCallAuthDto)
    auth: ColdCallAuthDto

}

export class ColdCallAuthDto {

    @IsString()
    domain: string

}