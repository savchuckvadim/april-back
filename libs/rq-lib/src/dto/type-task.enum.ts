import { ApiProperty } from '@nestjs/swagger';

export enum TypeTask {
    GET_RQ = 'get_requisite',
    UPDATE_RQ = 'update_requisite',
    UPDATE_ADDRESS = 'update_address',
    UPDATE_BANK = 'update_bank',
}

export class TypeTaskApi {
    @ApiProperty({
        description: 'Тип задачи',
        enum: TypeTask,
        example: TypeTask.GET_RQ,
    })
    value: TypeTask;
}
