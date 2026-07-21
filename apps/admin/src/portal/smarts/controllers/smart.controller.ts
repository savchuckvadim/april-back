import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SmartService } from '../services/smart.service';
import { SmartDetailsService } from '../services/smart-details.service';
import { CreateSmartDto } from '../dto/create-smart.dto';
import { UpdateSmartDto } from '../dto/update-smart.dto';
import { SmartResponseDto } from '../dto/smart-response.dto';
import { SmartDetailsResponseDto } from '../dto/smart-details-response.dto';
import { InstallCallReportSmartUseCase } from '@lib/call-lib';
import { CONST_SMART_REGISTRY } from '@lib/portal-lib/pbx/const-smart-registry';
import {
    InstallAicallDto,
    InstallAicallResponseDto,
} from '../dto/install-aicall.dto';
import { InstallConstSmartDto } from '../dto/install-const-smart.dto';
import { SmartRegistryResponseDto } from '../dto/smart-registry.dto';
import { ConstSmartInstallerResolver } from '../services/const-smart-installer.service';

@ApiTags('Admin Smarts Management')
@Controller('admin/pbx/smarts')
export class SmartController {
    constructor(
        private readonly smartService: SmartService,
        private readonly smartDetailsService: SmartDetailsService,
        private readonly installAicallUseCase: InstallCallReportSmartUseCase,
        private readonly constSmartInstallerResolver: ConstSmartInstallerResolver,
    ) {}

    @ApiOperation({
        summary: 'Реестр const-смартов',
        description:
            'Каталог смартов, устанавливаемых из констант (без Excel) — источник ' +
            'карточек «доступен к установке» в галерее смартов.',
    })
    @ApiResponse({
        status: 200,
        description: 'Реестр const-смартов',
        type: SmartRegistryResponseDto,
    })
    // ВАЖНО: объявлен ДО @Get(':id') — иначе 'registry' уйдёт в ParseIntPipe.
    @Get('registry')
    getRegistry(): SmartRegistryResponseDto {
        return {
            items: CONST_SMART_REGISTRY.map(descriptor => ({
                kind: descriptor.kind,
                type: descriptor.type,
                group: descriptor.group,
                code: descriptor.code,
                title: descriptor.title,
                source: 'const' as const,
                fieldsCount: descriptor.fieldsCount,
                hasCategories: descriptor.hasCategories,
                description: descriptor.description,
            })),
        };
    }

    @ApiOperation({
        summary: 'Установить const-смарт (generic)',
        description:
            'Идемпотентная установка const-смарта по kind из реестра ' +
            '(резолв kind → use-case; общий контракт результата).',
    })
    @ApiResponse({
        status: 200,
        description: 'Результат установки',
        type: InstallAicallResponseDto,
    })
    @Post('install-const')
    async installConst(
        @Body() dto: InstallConstSmartDto,
    ): Promise<InstallAicallResponseDto> {
        return this.constSmartInstallerResolver
            .resolve(dto.kind)
            .execute(dto.domain);
    }

    @ApiOperation({
        summary: 'Установить смарт «AI-анализ звонков»',
        description:
            'Идемпотентная установка AI-смарта на портал (общий use-case из ' +
            '@lib/call-lib, тот же что у event-sales): создаёт тип при отсутствии ' +
            'и доливает недостающие поля из const-конфига.',
    })
    @ApiResponse({
        status: 200,
        description: 'Результат установки',
        type: InstallAicallResponseDto,
    })
    @Post('install-aicall')
    async installAicall(
        @Body() dto: InstallAicallDto,
    ): Promise<InstallAicallResponseDto> {
        return this.installAicallUseCase.execute(dto.domain);
    }

    @ApiOperation({
        summary: 'Детали смарта',
        description:
            'Строка smarts + живое состояние в Bitrix: тип, воронки со стадиями, ' +
            'UF-поля с enum-значениями. Bitrix-часть fail-open (bitrix=null + error).',
    })
    @ApiResponse({
        status: 200,
        description: 'Детали смарта',
        type: SmartDetailsResponseDto,
    })
    @Get(':id/details')
    async getSmartDetails(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<SmartDetailsResponseDto> {
        return this.smartDetailsService.getDetails(id);
    }

    @ApiOperation({ summary: 'Create a new smart' })
    @ApiResponse({
        status: 201,
        description: 'Smart created successfully',
        type: SmartResponseDto,
    })
    @Post()
    async createSmart(
        @Body() createSmartDto: CreateSmartDto,
    ): Promise<SmartResponseDto | null> {
        const smart = await this.smartService.create(createSmartDto);
        return smart;
    }

    @ApiOperation({ summary: 'Get smart by ID' })
    @ApiResponse({
        status: 200,
        description: 'Smart found',
        type: SmartResponseDto,
    })
    @Get(':id')
    async getSmartById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<SmartResponseDto | null> {
        const smart = await this.smartService.findById(id);
        return smart;
    }

    @ApiOperation({ summary: 'Get all smarts' })
    @ApiResponse({
        status: 200,
        description: 'Smarts found',
        type: [SmartResponseDto],
    })
    @Get()
    async getAllSmarts(
        @Query('portal_id') portalId?: string,
    ): Promise<SmartResponseDto[]> {
        let smarts: SmartResponseDto[];
        if (portalId) {
            smarts = await this.smartService.findByPortalId(Number(portalId));
        } else {
            smarts = await this.smartService.findMany();
        }

        return smarts;
    }

    @ApiOperation({ summary: 'Update smart' })
    @ApiResponse({
        status: 200,
        description: 'Smart updated successfully',
        type: SmartResponseDto,
    })
    @Put(':id')
    async updateSmart(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateSmartDto: UpdateSmartDto,
    ): Promise<SmartResponseDto | null> {
        const smart = await this.smartService.update(id, updateSmartDto);
        return smart;
    }

    @ApiOperation({ summary: 'Delete smart' })
    @ApiResponse({
        status: 200,
        description: 'Smart deleted successfully',
    })
    @Delete(':id')
    async deleteSmart(@Param('id', ParseIntPipe) id: number): Promise<boolean> {
        await this.smartService.delete(id);
        return true;
    }
}
