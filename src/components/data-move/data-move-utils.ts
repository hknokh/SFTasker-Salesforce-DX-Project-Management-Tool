import fs from 'node:fs';
import { CommandUtils } from '../command-utils.js';
import { Constants } from '../constants.js';
import { SFtaskerCommand } from '../models.js';
import { Utils } from '../utils.js';
import { Script, ScriptObjectSet } from './data-move-models.js';

/**
 * Utility class for data-move command operations.
 */
export class DataMoveUtils<T> {
  // Public properties ----------------------------------------------------------
  // Script object
  public script!: Script;

  // Directory paths
  public configDir!: string;
  public sourceDir!: string;
  public targetDir!: string;
  public tempDir!: string;

  // Constructor ----------------------------------------------------------------
  /**
   *  Constructor for the data move utility class.
   * @param command  The command to process.
   */
  public constructor(private command: SFtaskerCommand<T>) {
    this.loadScript();
  }

  public loadScript(): void {
    const comUtils = new CommandUtils(this.command);
    const configPath = comUtils.getConfigFilePath();
    comUtils.logCommandMessage('process.loading-configuration-file', configPath);

    if (fs.existsSync(configPath)) {
      this.script = Utils.plainToCLass(Script, JSON.parse(fs.readFileSync(configPath, 'utf8')));
      if (this.script.objects.length > 0) {
        this.script.objectSets.unshift(new ScriptObjectSet({ objects: this.script.objects }));
        this.script.objects = [];
      }

      this.configDir = comUtils.createConfigDirectory() as string;
      this.sourceDir = comUtils.createConfigDirectory(Constants.DATA_MOVE_CONSTANTS.CSV_SOURCE_SUB_DIRECTORY) as string;
      this.targetDir = comUtils.createConfigDirectory(Constants.DATA_MOVE_CONSTANTS.CSV_TARGET_SUB_DIRECTORY) as string;
      this.tempDir = comUtils.createConfigDirectory(Constants.DATA_MOVE_CONSTANTS.TEMP_DIRECTORY) as string;
    } else {
      comUtils.throwError('error.config-file-not-found', configPath);
    }
  }
}
