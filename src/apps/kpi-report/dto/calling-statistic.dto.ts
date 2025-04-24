import { Transform } from "class-transformer";
import { IBXUser } from "src/modules/bitrix/domain/interfaces/bitrix.interface";
import { parseToISO } from "../lib/date-util";
export class GetCallingStatisticDto {
    domain: string;
    filters: GetCallingStatisticFiltersDto;
}

export class GetCallingStatisticFiltersDto {

    departament: IBXUser[];

    @Transform(({ value }) => parseToISO(value))
    dateFrom: string;
  
    @Transform(({ value }) => parseToISO(value))
    dateTo: string;


}


