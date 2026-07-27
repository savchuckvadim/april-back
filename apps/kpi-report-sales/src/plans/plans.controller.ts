import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PBXService } from '@/modules/pbx';
import { PlansConfigService } from './services/plans-config.service';
import { PlanUserFieldsService } from './domain/plan-user-fields.service';
import { PlanTargetsService } from './domain/plan-targets.service';
import { PLAN_INDICATORS } from './constants/plan-indicators.const';
import {
    PlansConfigGetRequestDto,
    PlansConfigGetResponseDto,
    PlansConfigSaveRequestDto,
    PlansConfigSaveResponseDto,
} from './dto/plans-config.dto';
import {
    PlanTargetsGetRequestDto,
    PlanTargetsGetResponseDto,
    PlanTargetsSaveRequestDto,
    PlanTargetsSaveResponseDto,
} from './dto/plan-targets.dto';

/**
 * Планы руководителя (целевые показатели сотрудников).
 *
 * Значения планов живут в Bitrix user-полях UF_USR_A_SALES_PLAN_*
 * (доустанавливаются находу перед сохранением); портальный конфиг
 * (включённые показатели, свои имена, период-типы) — строка-сентинел
 * report_settings (bxUserId=0). Достижение (факт/план) считает фронт
 * из уже загруженных отчётов. Доступ к настройке гейтится фронтом
 * (руководители); ручки лёгкие и синхронные.
 */
@ApiTags('Sales Plans')
@Controller('kpi-report/plans')
export class PlansController {
    constructor(
        private readonly pbx: PBXService,
        private readonly config: PlansConfigService,
    ) {}

    @Post('config/get')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Каталог показателей + конфиг планов портала',
        description:
            'Каталог фиксированный (истинная типизация); конфиг — включённые ' +
            'показатели, свои имена, период-типы. Дефолт — всё выключено.',
    })
    @ApiBody({ type: PlansConfigGetRequestDto })
    @ApiOkResponse({ type: PlansConfigGetResponseDto })
    async getConfig(
        @Body() dto: PlansConfigGetRequestDto,
    ): Promise<PlansConfigGetResponseDto> {
        const config = await this.config.getConfig(dto.domain);
        return { catalog: [...PLAN_INDICATORS], config };
    }

    @Post('config/save')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сохранить конфиг планов портала',
        description:
            'Настройка руководителя: какие показатели включены, свои ' +
            'названия, период задания плана.',
    })
    @ApiBody({ type: PlansConfigSaveRequestDto })
    @ApiOkResponse({ type: PlansConfigSaveResponseDto })
    async saveConfig(
        @Body() dto: PlansConfigSaveRequestDto,
    ): Promise<PlansConfigSaveResponseDto> {
        const config = await this.config.saveConfig(dto.domain, dto.config);
        return { config };
    }

    @Post('targets/get')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Планы сотрудников (из Bitrix user-полей)',
        description:
            'Читает UF_USR_A_SALES_PLAN_* одним user.get; не заданные ' +
            'планы — null (в т.ч. если поля ещё не установлены).',
    })
    @ApiBody({ type: PlanTargetsGetRequestDto })
    @ApiOkResponse({ type: PlanTargetsGetResponseDto })
    async getTargets(
        @Body() dto: PlanTargetsGetRequestDto,
    ): Promise<PlanTargetsGetResponseDto> {
        const { bitrix } = await this.pbx.init(dto.domain);
        const targets = await new PlanTargetsService(bitrix).getTargets(
            dto.userIds,
        );
        return { targets };
    }

    @Post('targets/save')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сохранить планы сотрудников',
        description:
            'Перед записью доустанавливает недостающие плановые user-поля ' +
            '(идемпотентно); изменения пишутся батчем — один user.update ' +
            'на сотрудника.',
    })
    @ApiBody({ type: PlanTargetsSaveRequestDto })
    @ApiOkResponse({ type: PlanTargetsSaveResponseDto })
    async saveTargets(
        @Body() dto: PlanTargetsSaveRequestDto,
    ): Promise<PlanTargetsSaveResponseDto> {
        const { bitrix } = await this.pbx.init(dto.domain);
        await new PlanUserFieldsService(
            dto.domain,
            this.pbx,
            bitrix,
        ).ensureInstalled();
        const updatedUsers = await new PlanTargetsService(bitrix).saveTargets(
            dto.targets,
        );
        return { updatedUsers };
    }
}
