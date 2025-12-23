import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Res,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Response } from 'express';
import { GsrMigrateUseCase } from './gsr-migrate.use-case';
import { GetDealsDto } from './dtos/get-deals.dto';
import { ContactsCreateUseCase } from './contacts-create.use-case';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IBXTask } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { TaskUseCase } from './task.use-case';
import { IsString, IsNotEmpty } from 'class-validator';
import { GsrSheetsMigrateUseCase } from './gsr-sheets-migrate.use-case';
import { GsrBitrixService } from './gsr-bitrix.service';
import { Express } from 'express';

class GsrMigrateDto {
    @IsString()
    @IsNotEmpty()
    domain: string;
    @IsString()
    @IsNotEmpty()
    userId: string;
}
@ApiTags('Commands')
@Controller('gsr-service')
export class GsrServiceController {
    constructor(
        private readonly migrateUseCase: GsrMigrateUseCase,
        private readonly contactsCreateUseCase: ContactsCreateUseCase,
        private readonly taskUseCase: TaskUseCase,
        private readonly sheetsMigrateUseCase: GsrSheetsMigrateUseCase,
        private readonly bitrixService: GsrBitrixService,
    ) { }

    @Post('parse')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: './uploads',
                filename: (_, file, cb) => {
                    const uniqueName = `${Date.now()}${extname(file.originalname)}`;
                    cb(null, uniqueName);
                },
            }),
        }),
    )
    async parseFile(
        @Body() body: GsrMigrateDto,
        @UploadedFile() file: Express.Multer.File,
        @Res() res: Response,
    ) {
        const result = await this.migrateUseCase.migrate(
            body.domain,
            body.userId,
            file.path,
        );
        return res.send(result);
    }

    @Post('sheets-parse')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: './uploads',
                filename: (_, file, cb) => {
                    const uniqueName = `${Date.now()}${extname(file.originalname)}`;
                    cb(null, uniqueName);
                },
            }),
        }),
    )
    async sheetsParse(
        @Body() body: GsrMigrateDto,
        @UploadedFile() file: Express.Multer.File,
        @Res() res: Response,
    ) {
        const result = await this.sheetsMigrateUseCase.migrate(
            body.domain,
            body.userId,
            file.path,
        );
        console.log('result');
        console.log(result);
        console.log(file.path);
        return res.send(result);
    }

    // @ApiResponse({
    //     status: 201,
    //     description: 'The record has been successfully created.',
    //     type: BitrixBatchResponseResultDto
    // })
    // @ApiResponse({ status: 403 })
    // @Post('contacts-create')
    // async contactsCreate(@Body() body: ContactCreateDto) {
    //     const result = await this.contactsCreateUseCase.create(body);
    //     return result;
    // }

    @Post('get-deals')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: './uploads',
                filename: (_, file, cb) => {
                    const uniqueName = `${Date.now()}${extname(file.originalname)}`;
                    cb(null, uniqueName);
                },
            }),
        }),
    )
    async getDeals(
        @Body() body: GetDealsDto,
        @UploadedFile() file: Express.Multer.File,
        @Res() res: Response,
    ) {
        const result = await this.migrateUseCase.getDeals(
            body.domain,
            file.path,
        );
        return res.send(result);
    }

    @Post('update-deals')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: './uploads',
                filename: (_, file, cb) => {
                    const uniqueName = `${Date.now()}${extname(file.originalname)}`;
                    cb(null, uniqueName);
                },
            }),
        }),
    )
    async updateDeals(
        @Body() body: GsrMigrateDto,
        @UploadedFile() file: Express.Multer.File,
        @Res() res: Response,
    ) {
        const result = await this.migrateUseCase.updateDeals(
            body.domain,
            body.userId,
            file.path,
        );
        return res.send(result);
    }

    @Post('migrate-from-json')
    @ApiOperation({ summary: 'Migrate data from JSON file to Bitrix' })
    @ApiResponse({
        status: 200,
        description: 'Migration completed successfully',
    })
    async migrateFromJson(
        @Body() body: GsrMigrateDto & { jsonFilePath?: string },
        @Res() res: Response,
    ) {
        // По умолчанию используем gsr.last-migrate.json, если путь не указан
        const jsonFilePath = body.jsonFilePath || 'uploads/gsr.last-migrate.json';

        const result = await this.bitrixService.loadAndMigrateFromJson(
            body.domain,
            body.userId,
            jsonFilePath,
        );
        return res.send(result);
    }

    @Get('tasks/:domain')
    @ApiOperation({ summary: 'Get tasks by domain' })
    @ApiParam({
        name: 'domain',
        description: 'Domain of the Bitrix portal',
        example: 'example.bitrix24.ru',
    })
    @ApiResponse({
        status: 200,
        description: 'Returns list of tasks',
        // type: [IBXTask ] // или создайте TaskDto если нужна более специфичная структура
    })
    async getTasks(@Param('domain') domain: string) {
        return await this.taskUseCase.getTasks(domain);
    }
}
