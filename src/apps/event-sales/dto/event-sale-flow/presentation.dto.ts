import { Type } from "class-transformer";

import { ValidateNested, IsNumber, IsBoolean } from "class-validator";


export class PresentationCountDto {
    @IsNumber()
    company: number;

    @IsNumber()
    smart: number;

    @IsNumber()
    deal: number;

}
export class PresentationDto {
    @ValidateNested()
    @Type(() => PresentationCountDto)
    count: PresentationCountDto

    @IsBoolean()
    isPresentationDone: boolean;

    @IsBoolean()
    isUnplannedPresentation: boolean;
}

