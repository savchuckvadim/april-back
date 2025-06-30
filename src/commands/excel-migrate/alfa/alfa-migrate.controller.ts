import { Body, Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { Response } from "express";
import { IsString, IsNotEmpty } from "class-validator";
import { ApiTags } from "@nestjs/swagger";
import { AlfaMigrateUseCase } from "./alfa-migrate.use-case";
import { Express } from "express";




class AlfaMigrateDto {
    @IsString()
    @IsNotEmpty()
    domain: string
 
   
}
@ApiTags('Commands')
@Controller('alfa-migrate-service')
export class AlfaServiceController {
    constructor(

        private readonly migrateUseCase: AlfaMigrateUseCase,
    

    ) { }

    @Post('parse')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: './uploads/alfa',
                filename: (_, file, cb) => {
                    const uniqueName = `${Date.now()}${extname(file.originalname)}`;
                    cb(null, uniqueName);
                },
            }),
        }),
    )
    async parseFile(
        @Body() body: AlfaMigrateDto,
        @UploadedFile() file: Express.Multer.File,
        @Res() res: Response) {
           
        const result = await this.migrateUseCase.migrate(body.domain, file.path);
        return res.send(result);
    }


   
}
