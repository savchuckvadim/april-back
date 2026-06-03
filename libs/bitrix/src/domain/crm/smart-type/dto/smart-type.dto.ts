import { IBXSmartType } from '../interface/smart-type.interface';

export class SmartTypeGetRequestDto {
    id: number | string;
}
export class SmartTypeGetByEntityTypeIdRequestDto {
    entityTypeId: string | number;
}
export class SmartTypeListRequestDto {
    filter?: Partial<IBXSmartType>;
    select?: string[];
    start: number = -1;
    order?: {
        [key in keyof IBXSmartType]?: 'asc' | 'desc' | 'ASC' | 'DESC';
    };
}

export class SmartTypeGetResponseDto {
    type: IBXSmartType;
}

export class SmartTypeListResponseDto {
    types: IBXSmartType[];
}

export class SmartTypeAddDto {}
