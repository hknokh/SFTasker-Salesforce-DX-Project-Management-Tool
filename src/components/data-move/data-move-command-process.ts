import { SFtaskerCommand } from '../models.js';

/**
 * Handles the processing of data move commands.
 *
 * @template T The type parameter for the SFtaskerCommand.
 */
export class DataMoveCommandProcess<T> {
  /**
   * Constructs a new DataMoveCommandProcess instance.
   *
   * @param command The command to process.
   */
  public constructor(private command: SFtaskerCommand<T>) {
    // Log the initialization of the DataMoveCommandProcess
    this.command.info('DataMoveCommandProcess constructor');
  }
}
