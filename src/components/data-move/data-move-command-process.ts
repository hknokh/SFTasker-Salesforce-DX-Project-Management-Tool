import { SFtaskerCommand } from '../models.js';

/**
 * Class for the data move command process.
 */
export class DataMoveCommandProcess<T> {
  public constructor(private command: SFtaskerCommand<T>) {}
}
