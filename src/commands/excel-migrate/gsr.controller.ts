import { Controller, Get, Post, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { GsrParseService } from "./gsr.service";
import { diskStorage } from "multer";
import { extname } from "path";
import { Response } from "express";


@Controller('gsr-service')
export class GsrServiceController {
    constructor(private readonly excelParserService: GsrParseService) { }

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
    async parseFile(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
        const result = await this.excelParserService.parseExcel(file.path);
        return res.send(result);
    }
}
