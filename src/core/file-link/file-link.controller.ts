import { Controller, Get, Param, Res, NotFoundException, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { FileLinkService } from './file-link.service';
import * as fs from 'fs';
import { EncryptService } from './encrypt.service';

@Controller('files')
export class FilesController {
  constructor(
    private readonly fileLinkService: FileLinkService,
    private readonly encryptService: EncryptService
  ) { }

  
  @Get(':token')
  async download(
    @Param('token') token: string,
    @Res() res: Response,
  ) {
    
      const payload = this.encryptService.decryptData(token);
    
    const { domain, userId, app, subDir, year, fileName } = payload;
    const filePath = await this.fileLinkService.getFilePath(domain, Number(userId), app, subDir, year, fileName);

    if (!filePath || !fs.existsSync(filePath)) {
      throw new NotFoundException('Файл не найден');
    }

    return res.download(filePath);
  }
}
