import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { InnerDealService } from '../services/inner-deal.service';
import {
    InnerDealCopyDto,
    InnerDealCopyResponseDto,
    InnerDealFindQueryDto,
    InnerDealFindResponseDto,
    InnerDealListQueryDto,
    InnerDealSettingsDto,
    InnerDealSnapshotDto,
    InnerDealUpsertDto,
    InnerDealVariantFindQueryDto,
    InnerDealVariantListQueryDto,
} from '../dto/inner-deal.dto';
import { toInnerDealSnapshotDto } from '../lib/inner-deal.mapper';

@ApiTags('KonstructorDeal')
@Controller('konstructor/deal')
export class InnerDealController {
    constructor(private readonly service: InnerDealService) {}

    @Get()
    @ApiOperation({
        summary: 'Слепок сделки по domain+dealId (+serviceSmartId)',
    })
    @ApiResponse({
        status: 200,
        description: 'found:false — слепка нет (нормальный флоу новой сделки)',
        type: InnerDealFindResponseDto,
    })
    async find(
        @Query() query: InnerDealFindQueryDto,
    ): Promise<InnerDealFindResponseDto> {
        const deal = await this.service.findSnapshot(
            query.domain,
            query.dealId,
            query.serviceSmartId ?? null,
        );
        return {
            found: deal !== null,
            deal: deal ? toInnerDealSnapshotDto(deal) : null,
        };
    }

    @Get('list')
    @ApiOperation({
        summary: 'Все слепки сделки (обычный + сервисные смарты)',
    })
    @ApiResponse({
        status: 200,
        type: InnerDealSnapshotDto,
        isArray: true,
    })
    async list(
        @Query() query: InnerDealListQueryDto,
    ): Promise<InnerDealSnapshotDto[]> {
        const deals = await this.service.listByDealId(
            query.domain,
            query.dealId,
        );
        return deals.map(toInnerDealSnapshotDto);
    }

    @Get('variants')
    @ApiOperation({
        summary: 'Варианты комплекта сделки',
        description:
            'Слепки вариантов предложения, собранных на сделке (строки с непустым variantSmartId). Обычный слепок сделки и слепок «предложения на будущий период» сюда не попадают.',
    })
    @ApiOkResponse({
        type: InnerDealSnapshotDto,
        isArray: true,
        description: 'Варианты в порядке создания.',
    })
    async variants(
        @Query() query: InnerDealVariantListQueryDto,
    ): Promise<InnerDealSnapshotDto[]> {
        const variants = await this.service.listVariants(
            query.domain,
            query.dealId,
        );
        return variants.map(toInnerDealSnapshotDto);
    }

    @Get('variant')
    @ApiOperation({
        summary: 'Слепок одного варианта комплекта',
        description:
            'Состояние конструктора конкретного варианта — тем же контрактом, что и обычный слепок сделки.',
    })
    @ApiOkResponse({
        type: InnerDealFindResponseDto,
        description: 'found:false — у варианта ещё нет сохранённого состояния.',
    })
    async variant(
        @Query() query: InnerDealVariantFindQueryDto,
    ): Promise<InnerDealFindResponseDto> {
        const deal = await this.service.findVariantSnapshot(
            query.domain,
            query.dealId,
            query.variantSmartId,
        );
        return {
            found: deal !== null,
            deal: deal ? toInnerDealSnapshotDto(deal) : null,
        };
    }

    @Post()
    @ApiOperation({
        summary:
            'Upsert слепка по (domain, dealId, serviceSmartId | variantSmartId)',
    })
    @ApiResponse({
        status: 201,
        type: InnerDealSnapshotDto,
    })
    async upsert(
        @Body() body: InnerDealUpsertDto,
    ): Promise<InnerDealSnapshotDto> {
        return toInnerDealSnapshotDto(await this.service.upsertSnapshot(body));
    }

    @Post('settings')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сохранить настройки сборки комплекта',
        description:
            'Режим (сравнение / вместе разными договорами / вместе одним договором), участники и настройки КП. Пишет только колонку настроек — слепок конструктора не трогает. settings:null возвращает сделку к поведению «один набор, одно КП».',
    })
    @ApiBody({
        type: InnerDealSettingsDto,
        description: 'Домен, сделка и настройки сборки.',
    })
    @ApiOkResponse({
        type: InnerDealSnapshotDto,
        description: 'Строка слепка сделки с обновлёнными настройками.',
    })
    async updateSettings(
        @Body() body: InnerDealSettingsDto,
    ): Promise<InnerDealSnapshotDto> {
        const deal = await this.service.updateSettings(
            body.domain,
            body.dealId,
            body.settings,
        );
        return toInnerDealSnapshotDto(deal);
    }

    @Post('copy')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Скопировать слепок из одной сделки в другую',
        description:
            'Ручное восстановление состояния конструктора: берёт слепок сделки-источника (при указанном sourceServiceSmartId — слепок её сервисного смарта) и кладёт копию в сделку-получатель. Если у получателя слепок уже есть, копия делается только с force:true — иначе вернётся copied:false, чтобы не затереть работу менеджера.',
    })
    @ApiBody({
        type: InnerDealCopyDto,
        description:
            'Домен, сделка-источник, сделка-получатель и флаг перезаписи.',
    })
    @ApiOkResponse({
        type: InnerDealCopyResponseDto,
        description:
            'copied:true — слепок скопирован; copied:false + reason — копирование не состоялось (нет источника или занята цель).',
    })
    async copy(
        @Body() body: InnerDealCopyDto,
    ): Promise<InnerDealCopyResponseDto> {
        const result = await this.service.copySnapshot({
            domain: body.domain,
            source: {
                kind: 'deal',
                dealId: body.sourceDealId,
                serviceSmartId: body.sourceServiceSmartId ?? null,
            },
            targetDealId: body.targetDealId,
            force: body.force,
        });

        return {
            copied: result.copied,
            reason: result.reason,
            deal: result.deal ? toInnerDealSnapshotDto(result.deal) : null,
        };
    }
}
