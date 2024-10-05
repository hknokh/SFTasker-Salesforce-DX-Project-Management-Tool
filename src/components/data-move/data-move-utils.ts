import fs from 'node:fs';
import { CommandUtils } from '../command-utils.js';
import { SFtaskerCommand } from '../models.js';
import { Constants } from '../constants.js';

/**
 * Utility class for data-move command operations.
 */
export class DataMoveUtils<T> {
  public config: any;

  public configDir!: string;
  public sourceDir!: string;
  public targetDir!: string;

  public constructor(private command: SFtaskerCommand<T>) {
    const utils = new CommandUtils(this.command);
    const configPath = utils.getConfigFilePath();
    if (fs.existsSync(configPath)) {
      this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      this.configDir = utils.createConfigDirectory() as string;
      this.sourceDir = utils.createConfigDirectory(Constants.DATA_MOVE_CONSTANTS.CSV_SOURCE_SUB_DIRECTORY) as string;
      this.targetDir = utils.createConfigDirectory(Constants.DATA_MOVE_CONSTANTS.CSV_TARGET_SUB_DIRECTORY) as string;
    } else {
      utils.throwError('error.config-file-not-found', configPath);
    }
  }
}
