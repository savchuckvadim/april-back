import { ApiProperty } from '@nestjs/swagger';

export enum IncludesEnum {
    org = 'org',
    ip = 'ip',
    fiz = 'fiz',
}

export class IncludesEnumApi {
    @ApiProperty({
        description: 'Тип реквизита',
        enum: IncludesEnum,
        example: IncludesEnum.org,
    })
    value: IncludesEnum;
}
