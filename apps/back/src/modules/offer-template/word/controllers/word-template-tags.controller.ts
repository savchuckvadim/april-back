import {
    Controller,
    Get,
    Post,
    BadRequestException,
    UploadedFile,
    UseInterceptors,
    Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import {
    ApiOperation,
    ApiResponse,
    ApiTags,
    ApiConsumes,
    ApiBody,
    ApiProduces,
} from '@nestjs/swagger';

import { DocumentTagsFileService } from '../services/document-tags-file.service';
import { DOCUMENT_TAGS_MIME_TYPE } from '../constants/document-tags.constants';

/**
 * set default
 * default может установить для шаблонов public только суперюзер
 * с пометкой is_default: true может быть только один шаблон в группе
 *
 *  default может установить для шаблонов portal любой user
 *

 */
@ApiTags('Konstructor Word Template Tags')
@Controller('word-templates-tags')
export class WordTemplateTagsController {
    constructor(
        private readonly documentTagsFileService: DocumentTagsFileService,
    ) {}

    @ApiOperation({
        summary: 'Upload document tags file',
        description:
            'Upload and overwrite fixed file in storage/app/konstructor/tags/offer-word/document-tags.docx',
    })
    @ApiResponse({
        status: 200,
        description: 'File uploaded successfully',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['file'],
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'DOCX file',
                },
            },
        },
    })
    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadDocumentTagsFile(
        @UploadedFile() file?: Express.Multer.File,
    ): Promise<{ path: string }> {
        if (!file) {
            throw new BadRequestException('DOCX file is required');
        }

        return this.documentTagsFileService.upload(file);
    }

    @ApiOperation({
        summary: 'Download document tags file',
        description:
            'Download fixed file from storage/app/konstructor/tags/offer-word/document-tags.docx',
    })
    @ApiResponse({
        status: 200,
        description: 'File download',
        schema: {
            type: 'string',
            format: 'binary',
        },
    })
    @ApiProduces(DOCUMENT_TAGS_MIME_TYPE)
    @Get('download')
    async downloadDocumentTagsFile(
        @Res({ passthrough: true }) res: Response,
    ): Promise<void> {
        await this.documentTagsFileService.download(res);
    }
}
