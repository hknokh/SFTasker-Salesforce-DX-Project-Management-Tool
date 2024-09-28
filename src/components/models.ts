import { Connection, Messages } from '@salesforce/core';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Constants } from './constants.js';
import { SftaskerCommandFlags } from './types.js';

/**
 * Base class for all sftasker commands.
 * @template T - The type of the result returned by the run method.
 */
export class SFtaskerCommand<T> extends SfCommand<T> {
  /**
   * The Salesforce organization ID.
   * @type {string}
   */
  public orgId!: string;

  /**
   * Messages related to the command execution.
   * @type {Messages<string>}
   */
  public messages!: Messages<string>;

  /**
   * Messages related to the components used in the task.
   * @type {Messages<string>}
   */
  public componentsMessages!: Messages<string>;

  /**
   * The flags used in the command.
   *
   * @type {SftaskerCommandFlags}
   */
  public flags!: SftaskerCommandFlags;

  private _connection!: Connection;

  public get connection(): Connection {
    return this._connection;
  }

  public set connection(value: Connection) {
    this._connection = value;
    this._connection.metadata.pollTimeout = Constants.POLL_TIMEOUT as number;
  }

  /**
   * Executes the command logic.
   * This method is not yet implemented and will throw an error.
   * @returns {Promise<T>} - A promise resolving to the command's result.
   */
  public run(): Promise<T> {
    this.error('Method not implemented.');
  }
}
