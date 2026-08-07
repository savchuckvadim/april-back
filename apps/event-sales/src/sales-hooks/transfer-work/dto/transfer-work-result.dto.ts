import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsString } from 'class-validator';
import { SalesHookOperationDto } from '../../core/dto/sales-hook-operation.dto';

/** Результат операции передачи работы. Пока каркас: implemented=false. */
export class TransferWorkResultDto {
    @ApiProperty({
        description:
            'Признак готовности доменной логики. false — каркас принял ' +
            'операцию, передача не выполнялась.',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    implemented: boolean;

    @ApiProperty({
        description:
            'Ключи переданных сущностей из запроса (эхо входных данных).',
        example: ['company:7'],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    entityKeys: string[];

    @ApiProperty({
        description: 'Пояснение для клиента, что произошло с операцией.',
        example: 'Передача выполнена (1); предупреждений: 0.',
        type: String,
    })
    @IsString()
    message: string;

    @ApiProperty({
        description:
            'Предупреждения graceful degradation: чужие воронки, ' +
            'несопоставленные fail-стадии, пропущенные просроченные задачи.',
        example: [],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    warnings: string[];
}

/** Операция передачи работы с типизированным результатом. */
export class TransferWorkOperationDto extends SalesHookOperationDto {
    @ApiPropertyOptional({
        description: 'Результат выполнения; null до завершения.',
        type: TransferWorkResultDto,
        nullable: true,
    })
    declare result: TransferWorkResultDto | null;
}
