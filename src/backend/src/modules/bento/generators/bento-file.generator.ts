import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { BentoDoc } from '../interfaces/bento-document.interface';

const TEMPLATE_PATH = path.resolve(__dirname, '../../../../templates/bento-shell.html');
const OUTPUT_DIR = path.resolve(__dirname, '../../../../bento-output');

@Injectable()
export class BentoFileGenerator {
  private readonly logger = new Logger(BentoFileGenerator.name);

  async generate(doc: BentoDoc, outputFileName: string): Promise<string> {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    const template = await fs.readFile(TEMPLATE_PATH, 'utf-8');
    const json = JSON.stringify(doc)
      // Escape `<` characters in JSON as required by Bento spec
      .replace(/</g, '\\u003c');

    const scriptTag = '<script type="application/bento+json" id="bento-doc">';
    const endTag = '</script>';

    const startIdx = template.indexOf(scriptTag);
    if (startIdx === -1) {
      throw new Error('bento-doc script tag not found in template');
    }

    const contentStart = startIdx + scriptTag.length;
    const contentEnd = template.indexOf(endTag, contentStart);

    const injected =
      template.slice(0, contentStart) + '\n' + json + '\n' + template.slice(contentEnd);

    const outputPath = path.join(OUTPUT_DIR, outputFileName);
    await fs.writeFile(outputPath, injected, 'utf-8');

    this.logger.log(`Bento file generated: ${outputPath}`);
    return outputPath;
  }
}
