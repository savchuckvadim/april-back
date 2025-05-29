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

  // @Get(':app/:subDir/:domain/:userId/:fileName')
  @Get(':token')
  async download(
    // @Param('app') app: 'konstructor' | 'transcription',
    // @Param('subDir') subDir: 'zoffer' | 'audio' | 'offer' | 'provider/stamp' | 'provider/logo' | 'offer' | 'contract' | 'supply',
    // @Param('domain') domain: string,
    // @Param('userId') userId: string,
    // @Param('fileName') fileName: string,
    @Param('token') token: string,

    @Res() res: Response,
  ) {
    
      const payload = this.encryptService.decryptData(token);
    
    const { domain, userId, app, subDir, fileName } = payload;
    const filePath = await this.fileLinkService.getFilePath(domain, Number(userId), app, subDir, fileName);

    if (!filePath || !fs.existsSync(filePath)) {
      throw new NotFoundException('Файл не найден');
    }

    return res.download(filePath);
  }
}
