import { Type } from 'class-transformer';
import {
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
    IsBoolean,
} from 'class-validator';
import { PlanDto } from './plan.dto';
import { ReportDto } from './report.dto';
import { EventTaskDto } from './task.dto';
import { PlacementDto } from './placement.dto';
import { ContactDto } from './contact.dto';
import { SaleDto } from './sale.dto';
import { DepartamentDto } from './department.dto';
import { FailDto } from './fail.dto';
import { LeadDto } from './lead.dto';
import { PresentationDto } from './presentation.dto';

export class EventSalesFlowDto {
    @IsString()
    domain: string;

    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => PlanDto)
    plan: PlanDto;

    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => ReportDto)
    report: ReportDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => EventTaskDto)
    currentTask?: EventTaskDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => PlacementDto)
    placement?: PlacementDto;

    @IsOptional()
    // @ValidateNested()
    @Type(() => ContactDto)
    contact?: ContactDto | null;

    @IsOptional()
    // @ValidateNested()
    @Type(() => SaleDto)
    sale?: SaleDto | null;

    @IsOptional()
    // @ValidateNested()
    @Type(() => DepartamentDto)
    departament?: DepartamentDto;

    @IsOptional()
    // @ValidateNested()
    @Type(() => FailDto)
    fail?: FailDto;

    @IsOptional()
    @IsBoolean()
    isPostSale?: boolean;

    @IsOptional()
    returnToTmc?: {
        data: boolean;
        isActive: boolean;
    };

    @IsOptional()
    @ValidateNested()
    @Type(() => LeadDto)
    lead?: LeadDto;

    @ValidateNested()
    @Type(() => PresentationDto)
    presentation: PresentationDto;
}
