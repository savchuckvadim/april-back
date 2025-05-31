import { Module } from '@nestjs/common';
import { OfferService } from './offer.service';
import { OfferController } from './offer.controller';
import { StorageModule } from 'src/core/storage/storage.module';
import { FileLinkModule } from 'src/core/file-link/file-link.module';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { ConfigModule } from '@nestjs/config';
import { LibreOfficeModule } from 'src/modules/libre-office/libre-office.module';
import { DocumentGenerateModule } from '../document-generate/document-generate.module';
import { OfferPdfService } from './offer.pdf.service';
import { PdfService } from './pdf-generator/pdf.generator.service';
@Module({
  imports: [
    PBXModule,
    StorageModule,
    FileLinkModule,
    ConfigModule,
    LibreOfficeModule,
    DocumentGenerateModule

  ],
  controllers: [OfferController],
  providers: [OfferService, OfferPdfService, PdfService],
})
export class OfferModule { }
