import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsString } from 'class-validator';
import { SalesHookOperationDto } from '../../core/dto/sales-hook-operation.dto';

/** Результат операции «в буфер отказников». Пока каркас: implemented=false. */
export class RejectBufferResultDto {
    @ApiProperty({
        description:
            'Признак готовности доменной логики. false — каркас принял ' +
            'операцию, стадии не менялись.',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    implemented: boolean;

    @ApiProperty({
        description: 'Ключи сущностей из запроса (эхо входных данных).',
        example: ['company:7'],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    entityKeys: string[];

    @ApiProperty({
        description: 'Пояснение для клиента, что произошло с операцией.',
        example: 'Буфер отказников: обработано 1; предупреждений: 0.',
        type: String,
    })
    @IsString()
    message: string;

    @ApiProperty({
        description:
            'Предупреждения graceful degradation: чужие воронки, ' +
            'несопоставленные fail-стадии.',
        example: [],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    warnings: string[];
}

/** Операция «в буфер отказников» с типизированным результатом. */
export class RejectBufferOperationDto extends SalesHookOperationDto {
    @ApiPropertyOptional({
        description: 'Результат выполнения; null до завершения.',
        type: RejectBufferResultDto,
        nullable: true,
    })
    declare result: RejectBufferResultDto | null;
}
