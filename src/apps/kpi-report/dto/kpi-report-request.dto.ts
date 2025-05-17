import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsArray,
    IsOptional,
    ValidateNested,
    IsObject,
    IsDateString,
    IsNumberString,
    IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';

// export class BXUserDto implements IBXUser {
//     @ApiProperty()
    
//     @IsNumberString()
//     ID: number;

//     @ApiProperty()
//     @IsString()
//     NAME: string;

//     @ApiProperty()
//     @IsString()
//     LAST_NAME: string;

//     @ApiProperty()
//     @IsString()
//     EMAIL: string;

//     @ApiProperty()
//     @IsString()
//     WORK_PHONE: string;

//     @ApiProperty()
//     @IsString()
//     WORK_POSITION: string;



//     @ApiProperty({ type: [Number] })
//     @IsArray()
//     UF_DEPARTMENT: number[];



//     @ApiProperty({ required: false })
//     @IsOptional()
//     UF_USR_1570437798556?: boolean | any[];

//     @ApiProperty()
//     @IsString()
//     USER_TYPE: string;


//     @IsString()
//     ACTIVE: boolean;

//     @IsString()
//     DATE_REGISTER: string;

//     @IsString()
//     IS_ONLINE: string;

//     @IsArray()
//     LAST_ACTIVITY_DATE: string[];

//     @IsString()
//     LAST_LOGIN: string;

//     @IsString()
//     PERSONAL_BIRTHDAY: string;

//     @IsString()
//     PERSONAL_CITY: string;

//     @IsString()
//     PERSONAL_GENDER: string;

//     @IsString()
//     PERSONAL_MOBILE: string;

//     @IsString()
//     PERSONAL_PHOTO: string;

//     @IsString()
//     PERSONAL_WWW: string;

//     @IsString()
//     SECOND_NAME: string;

//     @IsArray()
//     TIMESTAMP_X: string[];

//     @IsString()
//     TIME_ZONE_OFFSET: string;

//     @IsString()
//     UF_EMPLOYMENT_DATE: string;

//     @IsString()
//     UF_PHONE_INNER: string;



// }

export class BXUserDto {
    @ApiProperty()
    @IsNumberString()
    ID: string;
  
    @ApiProperty()
    @IsString()
    NAME: string;
  
    @ApiProperty()
    @IsString()
    LAST_NAME: string;
  }
export class ReportGetFiltersDto {
    @ApiProperty()
    @IsString()
    dateFrom: string;
  
    @ApiProperty()
    @IsString()
    dateTo: string;
  
    @ApiProperty({ type: [String] })
    @IsArray()
    userIds: Array<string | number>;
  
    @ApiProperty({ type: [BXUserDto] })
    @ValidateNested({ each: true })
    @Type(() => BXUserDto)
    @IsArray()
    departament: BXUserDto[];
  
    @ApiProperty()
    @IsString()
    userFieldId: string;
  
    @ApiProperty()
    @IsString()
    dateFieldId: string;
  
    @ApiProperty()
    @IsString()
    actionFieldId: string;
  
    @ApiProperty()
    @IsObject()
    currentActions: any;
  }

  export class ReportGetRequestDto {
    @ApiProperty()
    @IsString()
    domain: string;
  
    @ApiProperty({ type: ReportGetFiltersDto })
    @ValidateNested()
    @Type(() => ReportGetFiltersDto)
    filters: ReportGetFiltersDto;
  
    // @ApiProperty({ required: false })
    // @IsOptional()
    // @IsString()
    // socketId?: string;
  }
  
// export class ReportGetFiltersDto {
//     dateFrom: string;
//     dateTo: string;
//     userIds: Array<string | number>;

//     // @ArrayNotEmpty()
//     // @IsArray()
//     // @IsNotEmpty()
//     departament: IBXUser[];
//     userFieldId: string;
//     dateFieldId: string;
//     actionFieldId: string;
//     currentActions: any;
// }

// export class ReportGetRequestDto {
//     domain: string;
//     // @ValidateNested()
//     // @Type(() => ReportGetFiltersDto)
//     filters: ReportGetFiltersDto;
//     socketId?: string; // 👈 сюда клиент пишет свой socket.id
// }