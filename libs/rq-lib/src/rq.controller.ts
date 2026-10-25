import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiOkResponse,
    ApiExtraModels,
    getSchemaPath,
} from '@nestjs/swagger';
import { GetRqUseCase } from './use-cases/get-rq.use-case';
import { StoreRqUseCase } from './use-cases/store-rq.use-case';
import { UpdateAddressUseCase } from './use-cases/update-address.use-case';
import {
    GetRqRequestDto,
    StoreRqAddressResponseDto,
    StoreRqBankResponseDto,
    StoreRqItemResponseDto,
    StoreRqRequestDto,
    UpdateAddressRequestDto,
} from './dto/request.dto';
import { RqResponseDto } from './dto/erq-item.dto';
import { RqCaseRequestDto, RqCaseResponseDto } from './dto/case.dto';
import { RqCaseService } from './services/rq-case.service';

/**
 * Реквизиты компании Bitrix (пресеты, адреса, банки). Контроллер общий для
 * apps/rq (легаси-хуки) и apps/konstructor (фронт конструктора через
 * nest-konstructor-api), поэтому формы запросов/ответов не меняем — только
 * описываем для Swagger.
 */
@ApiTags('Rq')
@ApiExtraModels(
    StoreRqItemResponseDto,
    StoreRqAddressResponseDto,
    StoreRqBankResponseDto,
)
@Controller('rq')
export class RqController {
    constructor(
        private readonly getRqUseCase: GetRqUseCase,
        private readonly storeRqUseCase: StoreRqUseCase,
        private readonly updateAddressUseCase: UpdateAddressUseCase,
        private readonly rqCaseService: RqCaseService,
    ) {}

    @Post('get_rq')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Реквизиты компании по типам (org/ip/fiz) и текущий',
        description:
            'domain (str): domain портала, company_id (int): id компании, iswait (bool): TRUE - внеочереди, FALSE - в очередь',
    })
    @ApiOkResponse({ type: RqResponseDto })
    async getRq(@Body() body: GetRqRequestDto): Promise<RqResponseDto> {
        const result = await this.getRqUseCase.execute(body);

        return new RqResponseDto(result);
    }

    @Post('store_rq')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Сохранить реквизит, адрес или банк',
        description:
            'Ровно одно из rq / address / bank. rq → data: ERQItem (с bx_id), address → data: boolean, bank → data: id банка',
    })
    @ApiOkResponse({
        schema: {
            oneOf: [
                { $ref: getSchemaPath(StoreRqItemResponseDto) },
                { $ref: getSchemaPath(StoreRqAddressResponseDto) },
                { $ref: getSchemaPath(StoreRqBankResponseDto) },
            ],
        },
    })
    async storeRq(
        @Body() body: StoreRqRequestDto,
    ): Promise<
        | StoreRqItemResponseDto
        | StoreRqAddressResponseDto
        | StoreRqBankResponseDto
    > {
        const result = await this.storeRqUseCase.execute(body);

        return { data: result };
    }

    @Post('update_address')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Обновляет адрес реквизита',
    })
    @ApiOkResponse({ type: Boolean })
    async updateAddress(
        @Body() body: UpdateAddressRequestDto,
    ): Promise<boolean> {
        const result = await this.updateAddressUseCase.execute(body);

        return result;
    }

    @Post('case')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Родительный падеж (ФИО директора, должность, основание)',
    })
    @ApiOkResponse({ type: RqCaseResponseDto })
    declineCase(@Body() body: RqCaseRequestDto): RqCaseResponseDto {
        return { case: this.rqCaseService.decline(body.value, body.kind) };
    }
}
