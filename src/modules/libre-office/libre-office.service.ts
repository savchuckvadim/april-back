// src/libreoffice/libreoffice.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

const execAsync = promisify(exec);

@Injectable()
export class LibreOfficeService {
  private readonly logger = new Logger(LibreOfficeService.name);

  async convertToPdf(inputPath: string, outputDir?: string): Promise<string> {
    if (!existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    const outputFolder = outputDir || dirname(inputPath);
    if (!existsSync(outputFolder)) {
      mkdirSync(outputFolder, { recursive: true });
    }

    const command = `soffice --headless --convert-to pdf --outdir "${outputFolder}" "${inputPath}"`;

    this.logger.log(`Executing command: ${command}`);
    try {
      await execAsync(command);
      const outputFilePath = join(outputFolder, this.replaceExtension(inputPath, '.pdf'));
      if (!existsSync(outputFilePath)) {
        throw new Error('Conversion failed: PDF not found');
      }
      return outputFilePath;
    } catch (error) {
      this.logger.error('LibreOffice conversion error', error);
      throw error;
    }
  }

  private replaceExtension(filePath: string, newExt: string): string {
    return filePath.replace(/\.[^/.]+$/, newExt);
  }
}
