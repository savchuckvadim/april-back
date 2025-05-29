// src/libreoffice/libreoffice.module.ts
import { Module } from '@nestjs/common';
import { LibreOfficeService } from './libre-office.service';

@Module({
  providers: [LibreOfficeService],
  exports: [LibreOfficeService],
})
export class LibreOfficeModule {}
