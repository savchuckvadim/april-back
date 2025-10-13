import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    ParseIntPipe,
    HttpCode,
    HttpStatus,
    UseInterceptors,
    UploadedFile,
} from '@nestjs/common';
import { OfferTemplateImageService } from '../services/offer-template-image.service';
import { CreateOfferTemplateImageDto, StorageType } from '../dtos/create-offer-template-image.dto';
import { UpdateOfferTemplateImageDto } from '../dtos/update-offer-template-image.dto';
import { OfferTemplateImage } from '../entities/offer-template-image.entity';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OfferTemplateImageQueryDto } from '../dtos/find-all-offer-template-image.dto';
import {
    OfferTemplateImageIdParamsDto,
    OfferTemplateImagePortalIdParamsDto,
    OfferTemplateImageParentParamsDto,
    OfferTemplateImageStorageTypeParamsDto
} from '../dtos/offer-template-image-params.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from 'src/core/storage/storage.service';


@ApiTags('Konstructor Offer Template Image')
@Controller('offer-template-images')
export class OfferTemplateImageController {
    constructor(
        private readonly offerTemplateImageService: OfferTemplateImageService,
        private readonly storageService: StorageService,
    ) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                parent: { type: 'string', enum: ['template', 'page', 'block', 'sticker', 'other'] },
                domain: { type: 'string' },
                portal_id: { type: 'number' },
            },
        },
    })
    async uploadImage(
        @UploadedFile() file: Express.Multer.File,
        @Body() body: Omit<CreateOfferTemplateImageDto, 'path' | 'size' | 'mime' | 'width' | 'height'>,
    ) {
        // сохраняем файл через StorageService
        const path = await this.storageService.saveFile(
            file.buffer,
            file.originalname,
            StorageType.PUBLIC,
            body.parent ?? 'other',
        );

        // собираем DTO для БД
        const dto: CreateOfferTemplateImageDto = {
            path,
            storage_type: body.storage_type,
            original_name: file.originalname,
            mime: file.mimetype,
            size: String(file.size),
            height: '0', // можно вычислить через sharp
            width: '0',  // можно вычислить через sharp
            parent: body.parent,
            domain: body.domain,
            portal_id: body.portal_id ? Number(body.portal_id) : undefined,
        };

        return this.offerTemplateImageService.create(dto);
    }

    @ApiOperation({ summary: 'Create offer template image', description: 'Create a new offer template image' })
    @Post()
    async createOfferTemplateImage(
        @Body() createOfferTemplateImageDto: CreateOfferTemplateImageDto,
    ): Promise<OfferTemplateImage> {
        return this.offerTemplateImageService.create(
            createOfferTemplateImageDto,
        );
    }

    @ApiOperation({ summary: 'Get all offer template images', description: 'Get all offer template images' })
    @Get()
    async findAllOfferTemplateImage(
        @Query() query?: OfferTemplateImageQueryDto,
        // @Query('storage_type') storage_type?: 'app' | 'public' | 'private',
        // @Query('parent')
        // parent?: 'template' | 'page' | 'block' | 'sticker' | 'other',
        // @Query('is_public') is_public?: string,
    ): Promise<OfferTemplateImage[]> {
        const { portal_id, storage_type, parent, is_public } = query || {};
        const filters: any = {};

        if (portal_id) filters.portal_id = BigInt(portal_id);
        if (storage_type) filters.storage_type = storage_type;
        if (parent) filters.parent = parent;
        if (is_public !== undefined) filters.is_public = is_public === true;

        return this.offerTemplateImageService.findMany(filters);
    }

    @ApiOperation({ summary: 'Get offer template images by portal', description: 'Get offer template images by portal' })
    @Get('portal/:portal_id')
    async findByPortal(
        @Param() params: OfferTemplateImagePortalIdParamsDto,
    ): Promise<OfferTemplateImage[]> {
        return this.offerTemplateImageService.findByPortal(BigInt(params.portal_id));
    }

    @ApiOperation({ summary: 'Get offer template images by parent', description: 'Get offer template images by parent' })
    @Get('parent/:parent')
    async findByParent(
        @Param() params: OfferTemplateImageParentParamsDto,
    ): Promise<OfferTemplateImage[]> {
        return this.offerTemplateImageService.findByParent(params.parent);
    }

    @ApiOperation({ summary: 'Get offer template images by storage type', description: 'Get offer template images by storage type' })
    @Get('storage/:storage_type')
    async findByStorageType(
        @Param() params: OfferTemplateImageStorageTypeParamsDto,
    ): Promise<OfferTemplateImage[]> {
        return this.offerTemplateImageService.findByStorageType(params.storage_type);
    }

    @ApiOperation({ summary: 'Get offer template image by id', description: 'Get offer template image by id' })
    @Get(':id')
    async findOne(
        @Param() params: OfferTemplateImageIdParamsDto,
    ): Promise<OfferTemplateImage> {
        return this.offerTemplateImageService.findById(BigInt(params.id));
    }

    @ApiOperation({ summary: 'Get offer template image by id with relations', description: 'Get offer template image by id with relations' })
    @Get(':id/full')
    async findOneWithRelations(
        @Param() params: OfferTemplateImageIdParamsDto,
    ): Promise<OfferTemplateImage> {
        return this.offerTemplateImageService.findWithRelations(BigInt(params.id));
    }

    @ApiOperation({ summary: 'Update offer template image', description: 'Update offer template image' })
    @Patch(':id')
    async update(
        @Param() params: OfferTemplateImageIdParamsDto,
        @Body() updateOfferTemplateImageDto: UpdateOfferTemplateImageDto,
    ): Promise<OfferTemplateImage> {
        return this.offerTemplateImageService.update(
            BigInt(params.id),
            updateOfferTemplateImageDto,
        );
    }

    @ApiOperation({ summary: 'Delete offer template image', description: 'Delete offer template image' })
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param() params: OfferTemplateImageIdParamsDto): Promise<void> {
        return this.offerTemplateImageService.delete(BigInt(params.id));
    }

    @ApiOperation({ summary: 'Set public offer template image', description: 'Set public offer template image' })
    @Patch(':id/public')
    async setPublic(
        @Param() params: OfferTemplateImageIdParamsDto,
        @Body('is_public') is_public: boolean,
    ): Promise<OfferTemplateImage> {
        return this.offerTemplateImageService.setPublic(BigInt(params.id), is_public);
    }
}
