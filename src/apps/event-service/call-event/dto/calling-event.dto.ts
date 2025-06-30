import {
    IsString,
    IsInt,
    IsOptional,
    IsBoolean,
    ValidateNested,
    IsArray,
  } from 'class-validator';
  import { Type } from 'class-transformer';
  
  class CallingPlanCurrentItems {
    @IsString()
    name: string;
  
    @IsString()
    code: string;
  }
  
  class CallingPlanCurrent {
    @ValidateNested()
    @Type(() => CallingPlanCurrentItems)
    current: CallingPlanCurrentItems;
  }
  
  class CallingIsPlanned {
    @IsString()
    name: string;
  
    @IsString()
    date: string;
  }
  
  class CallingCreatedBy {
    @IsInt()
    ID: number;
  }
  
  class CallingContact {
    @IsInt()
    ID: number;
  }
  
  class CallingCommunication {
    @IsOptional()
    @ValidateNested()
    @Type(() => CallingPlanCurrentItems)
    type?: CallingPlanCurrentItems;
  
    @IsOptional()
    @ValidateNested()
    @Type(() => CallingPlanCurrentItems)
    initiative?: CallingPlanCurrentItems;
  }
  
  class CallingPlan {
    // @ValidateNested()
    // @Type(() => CallingIsPlanned)
    // isPlanned: CallingIsPlanned;
  
    @IsString()
    deadline: string;
  
    @IsString()
    name: string;
  
    @ValidateNested()
    @Type(() => CallingCreatedBy)
    createdBy: CallingCreatedBy;
  
    @ValidateNested()
    @Type(() => CallingCreatedBy)
    responsibility: CallingCreatedBy;
  
    @IsOptional()
    @ValidateNested()
    @Type(() => CallingContact)
    contact?: CallingContact;
  
    @ValidateNested()
    @Type(() => CallingPlanCurrent)
    type: CallingPlanCurrent;
  
    @IsBoolean()
    isActive: boolean;
  
    @IsBoolean()
    isExpired: boolean;
  
    @ValidateNested()
    @Type(() => CallingCommunication)
    communication: CallingCommunication;
  }
  
  class CallingReportResults {
    @IsBoolean()
    edu: boolean;
  
    @IsBoolean()
    edu_first: boolean;
  
    @IsBoolean()
    presentation: boolean;
  
    @IsBoolean()
    signal: boolean;
  }
  
  class CallingReport {
    @IsOptional()
    @IsString()
    resultStatus?: string;
  
    @IsString()
    description: string;
  
    @ValidateNested()
    @Type(() => CallingReportResults)
    results: CallingReportResults;
  
    @IsOptional()
    @ValidateNested()
    @Type(() => CallingContact)
    contact?: CallingContact;
  
    @ValidateNested()
    @Type(() => CallingCommunication)
    communication: CallingCommunication;
  }
  
  export class CallingCurrentTask {
    @IsInt()
    id: number;
  
    @IsArray()
    @IsString({ each: true })
    ufCrmTask: string[];
  
    @IsString()
    title: string;
  
    @IsString()
    eventType: string;
  
    @IsString()
    type: string;
  
    @IsString()
    name: string;
  
    @IsInt()
    responsibleId: number;
  }
  
  class CallingPlacementItem {
    @IsInt()
    ID: number;
  }
  
  class CallingPlacementField {
    @ValidateNested()
    @Type(() => CallingPlacementItem)
    options: CallingPlacementItem;
  }
  
  class CallingDepartamentUser {
    @IsInt()
    ID: number;
  }
  
  class CallingDepartament {
    @ValidateNested()
    @Type(() => CallingDepartamentUser)
    currentUser: CallingDepartamentUser;
  }
  
  class CallingBX {
    @IsOptional()
    @IsInt()
    dealId?: number;
  
    @IsOptional()
    @IsInt()
    companyId?: number;
  
    @IsOptional()
    @IsInt()
    taskGroupId?: number;
  }
  
  export class CallingEventDto {
    @IsString()
    domain: string;
  
    @ValidateNested()
    @Type(() => CallingReport)
    report: CallingReport;
  
    @ValidateNested()
    @Type(() => CallingPlan)
    plan: CallingPlan;
  
    @ValidateNested()
    @Type(() => CallingPlacementField)
    placement: CallingPlacementField;
  
    @IsOptional()
    @ValidateNested()
    @Type(() => CallingCurrentTask)
    currentTask?: CallingCurrentTask;
  
    @ValidateNested()
    @Type(() => CallingDepartament)
    departament: CallingDepartament;
  
    // @IsOptional()
    // @IsInt()
    // dealId?: number;
  
    @ValidateNested()
    @Type(() => CallingBX)
    bx: CallingBX;
  }
  