import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Res,
    UploadedFiles,
    UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiProduces,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import {
    ContractTemplateActiveDto,
    ContractTemplateDefaultDto,
} from '../dto/contract-template-patch-flags.dto';
import {
    ContractTemplateIdParamsDto,
    ContractTemplatePortalParamsDto,
} from '../dto/contract-template-params.dto';
import { ContractTemplateQueryDto } from '../dto/contract-template-query.dto';
import {
    ContractTemplatePageDto,
    ContractTemplateResponseDto,
} from '../dto/contract-template-response.dto';
import {
    CreateContractTemplateBodyDto,
    CreateContractTemplateMultipartDto,
} from '../dto/create-contract-template.dto';
import {
    SetContractTemplateAgentDto,
    SetContractTemplatePortalDto,
    UpdateContractTemplateDto,
} from '../dto/update-contract-template.dto';
import { ContractTemplateDownloadService } from '../services/contract-template-download.service';
import { ContractTemplateQueryService } from '../services/contract-template-query.service';
import {
    ContractTemplateService,
    type ContractTemplateUploads,
} from '../services/contract-template.service';
import { CONTRACT_TEMPLATE_API_DOCS as DOCS } from './contract-template.api-docs';

const DOCX_MIME =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Поля multipart: сам шаблон и необязательный заполненный пример. */
const UPLOAD_FIELDS = [
    { name: 'file', maxCount: 1 },
    { name: 'demo', maxCount: 1 },
];

/** Первый файл каждого поля `FileFieldsInterceptor` → форма для сервиса. */
function toUploads(
    files: Record<string, Express.Multer.File[]> | undefined,
): ContractTemplateUploads {
    return { file: files?.file?.[0], demo: files?.demo?.[0] };
}

@ApiTags('Contract templates')
@Controller('contract-templates')
export class ContractTemplateController {
    constructor(
        private readonly contractTemplateService: ContractTemplateService,
        private readonly queryService: ContractTemplateQueryService,
        private readonly downloadService: ContractTemplateDownloadService,
    ) {}

    @ApiOperation(DOCS.list)
    @ApiResponse({ status: 200, type: ContractTemplatePageDto })
    @Get()
    async findAll(
        @Query() query: ContractTemplateQueryDto,
    ): Promise<ContractTemplatePageDto> {
        return this.queryService.findMany(query);
    }

    @ApiOperation(DOCS.common)
    @ApiResponse({ status: 200, type: ContractTemplatePageDto })
    @Get('common')
    async findCommon(
        @Query() query: ContractTemplateQueryDto,
    ): Promise<ContractTemplatePageDto> {
        return this.queryService.findCommon(query);
    }

    @ApiOperation(DOCS.byPortal)
    @ApiResponse({ status: 200, type: ContractTemplatePageDto })
    @Get('portal/:portal_id')
    async findByPortal(
        @Param() params: ContractTemplatePortalParamsDto,
        @Query() query: ContractTemplateQueryDto,
    ): Promise<ContractTemplatePageDto> {
        return this.queryService.findByPortal(BigInt(params.portal_id), query);
    }

    @ApiOperation(DOCS.download)
    @ApiQuery({
        name: 'demo',
        required: false,
        description: 'demo=1 отдаёт демонстрационный файл вместо шаблона.',
        example: '1',
    })
    @ApiProduces(DOCX_MIME)
    @Get(':id/download')
    async download(
        @Param() params: ContractTemplateIdParamsDto,
        @Res({ passthrough: true }) res: Response,
        @Query('demo') demo?: string,
    ): Promise<void> {
        await this.downloadService.downloadById(
            BigInt(params.id),
            res,
            demo === '1' || demo === 'true',
        );
    }

    @ApiOperation(DOCS.byId)
    @ApiResponse({ status: 200, type: ContractTemplateResponseDto })
    @Get(':id')
    async findOne(
        @Param() params: ContractTemplateIdParamsDto,
    ): Promise<ContractTemplateResponseDto> {
        return this.queryService.findById(BigInt(params.id));
    }

    @ApiOperation(DOCS.create)
    @ApiResponse({ status: 201, type: ContractTemplateResponseDto })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: CreateContractTemplateMultipartDto })
    @Post()
    @UseInterceptors(FileFieldsInterceptor(UPLOAD_FIELDS))
    async create(
        @Body() body: CreateContractTemplateBodyDto,
        @UploadedFiles() files?: Record<string, Express.Multer.File[]>,
    ): Promise<ContractTemplateResponseDto> {
        return this.contractTemplateService.create(body, toUploads(files));
    }

    @ApiOperation(DOCS.update)
    @ApiResponse({ status: 200, type: ContractTemplateResponseDto })
    @ApiConsumes('multipart/form-data', 'application/json')
    @ApiBody({ type: UpdateContractTemplateDto })
    @Patch(':id')
    @UseInterceptors(FileFieldsInterceptor(UPLOAD_FIELDS))
    async update(
        @Param() params: ContractTemplateIdParamsDto,
        @Body() dto: UpdateContractTemplateDto,
        @UploadedFiles() files?: Record<string, Express.Multer.File[]>,
    ): Promise<ContractTemplateResponseDto> {
        return this.contractTemplateService.update(
            BigInt(params.id),
            dto,
            toUploads(files),
        );
    }

    @ApiOperation(DOCS.setPortal)
    @ApiResponse({ status: 200, type: ContractTemplateResponseDto })
    @Patch(':id/portal')
    async setPortal(
        @Param() params: ContractTemplateIdParamsDto,
        @Body() body: SetContractTemplatePortalDto,
    ): Promise<ContractTemplateResponseDto> {
        return this.contractTemplateService.setPortal(
            BigInt(params.id),
            body.portal_id,
        );
    }

    @ApiOperation(DOCS.setAgent)
    @ApiResponse({ status: 200, type: ContractTemplateResponseDto })
    @Patch(':id/agent')
    async setAgent(
        @Param() params: ContractTemplateIdParamsDto,
        @Body() body: SetContractTemplateAgentDto,
    ): Promise<ContractTemplateResponseDto> {
        return this.contractTemplateService.setAgent(
            BigInt(params.id),
            body.agent_id,
        );
    }

    @ApiOperation(DOCS.setActive)
    @ApiResponse({ status: 200, type: ContractTemplateResponseDto })
    @Patch(':id/active')
    async setActive(
        @Param() params: ContractTemplateIdParamsDto,
        @Body() body: ContractTemplateActiveDto,
    ): Promise<ContractTemplateResponseDto> {
        return this.contractTemplateService.setActive(
            BigInt(params.id),
            body.is_active,
        );
    }

    @ApiOperation(DOCS.setDefault)
    @ApiResponse({ status: 200, type: ContractTemplateResponseDto })
    @Patch(':id/default')
    async setDefault(
        @Param() params: ContractTemplateIdParamsDto,
        @Body() body: ContractTemplateDefaultDto,
    ): Promise<ContractTemplateResponseDto> {
        return this.contractTemplateService.setDefault(
            BigInt(params.id),
            body.is_default,
        );
    }

    @ApiOperation(DOCS.archive)
    @ApiResponse({ status: 200, type: ContractTemplateResponseDto })
    @Patch(':id/archive')
    async archive(
        @Param() params: ContractTemplateIdParamsDto,
    ): Promise<ContractTemplateResponseDto> {
        return this.contractTemplateService.archive(BigInt(params.id));
    }

    @ApiOperation(DOCS.unarchive)
    @ApiResponse({ status: 200, type: ContractTemplateResponseDto })
    @Patch(':id/unarchive')
    async unarchive(
        @Param() params: ContractTemplateIdParamsDto,
    ): Promise<ContractTemplateResponseDto> {
        return this.contractTemplateService.unarchive(BigInt(params.id));
    }

    @ApiOperation(DOCS.remove)
    @ApiResponse({ status: 200, description: 'Шаблон удалён.' })
    @Delete(':id')
    async remove(@Param() params: ContractTemplateIdParamsDto): Promise<void> {
        await this.contractTemplateService.delete(BigInt(params.id));
    }
}
