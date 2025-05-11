import { Body, Controller, Logger, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { InitSupplyUseCase } from './init-supply.use-case';
import { diskStorage } from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname } from 'path';
import { Response } from "express";

@Controller('konstructor')
export class InitSupplyController {
  constructor(private readonly initSupplyUseCase: InitSupplyUseCase) { }

  @Post('init-supply')
  @UseInterceptors(
    FileInterceptor('file_current_contract', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_, fileContract, cb) => {
          const uniqueName = `${Date.now()}${extname(fileContract.originalname)}`;
          cb(null, uniqueName);
        },
      }),
    }),

    FileInterceptor('file_current_invoice', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_, fileInvoice, cb) => {
          const uniqueName = `${Date.now()}${extname(fileInvoice.originalname)}`;
          cb(null, uniqueName);
        },
      }),
    }),
  )
  async initSupply(@Body() body: { domain: string },
    @UploadedFile() fileContract: Express.Multer.File,
    @UploadedFile() fileInvoice: Express.Multer.File,
    @Res() res: Response) {

    const testFileContract = fileContract
    const testFileInvoice = fileInvoice
    const test = body
    Logger.log(test)
    this.initSupplyUseCase.initSupply(body);
    return res.send(test)
  }
}
