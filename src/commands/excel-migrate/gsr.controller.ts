import { Body, Controller, Get, Post, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { Response } from "express";
import { GsrMigrateUseCase } from "./gsr-migrate.use-case";
import { ContactCreateDto, ContactsCreateUseCase } from "./contacts-create.use-case";
import { ApiProperty, ApiResponse, ApiTags } from "@nestjs/swagger";
import { IBitrixBatchResponseResult, IBitrixBatchError } from 'src/modules/bitrix/core/interface/bitrix-api.intterface';


class BitrixBatchResponseResultDto implements IBitrixBatchResponseResult {
    @ApiProperty()
    result: { [key: string]: { ID: number | string } };

    @ApiProperty()
    result_error: { [key: string]: IBitrixBatchError } | [];

    @ApiProperty()
    result_total: { [key: string]: any }[];

    @ApiProperty()
    result_next: { [key: string]: any }[];
}

@Controller('gsr-service')
export class GsrServiceController {
    constructor(

        private readonly migrateUseCase: GsrMigrateUseCase,
        private readonly contactsCreateUseCase: ContactsCreateUseCase
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
        @Body() body: { domain: string },
        @UploadedFile() file: Express.Multer.File,
        @Res() res: Response) {
        const result = await this.migrateUseCase.migrate(body.domain, file.path);
        return res.send(result);
    }

    @ApiResponse({
        status: 201,
        description: 'The record has been successfully created.',
        type: BitrixBatchResponseResultDto
    })
    @ApiResponse({ status: 403 })
    @Post('contacts-create')
    async contactsCreate(@Body() body: ContactCreateDto) {
        const result = await this.contactsCreateUseCase.create(body);
        return result;
    }
}
