import { SFtaskerCommand } from '../models.js';

/**
 * Utility class for data-move command operations.
 */
export class DataMoveUtils<T> {
  // Constructor ----------------------------------------------------------------
  /**
   *  Constructor for the data move utility class.
   * @param command  The command to process.
   */
  public constructor(private command: SFtaskerCommand<T>) {
    this.command.info('DataMoveUtils.constructor');
  }
}
