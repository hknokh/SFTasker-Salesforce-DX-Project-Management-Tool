import { Flags } from '@salesforce/sf-plugins-core';
import { CommandUtils } from '../../components/command-utils.js';
import { SFtaskerCommand } from '../../components/models.js';
import { Constants } from '../../components/constants.js';
import { DataMoveUtils } from '../../components/data-move/data-move-utils.js';

/** Represents the result of the Sftasker Data Move command. */
export type SftaskerDataMoveResult = Record<string, never>;

// Set up the command messages using the CommandUtils utility.
const messages = CommandUtils.setupCommandMessages('sftasker', 'data-move');

/**
 * Command class for performing data move operations using Sftasker.
 *
 * @extends SFtaskerCommand
 */
export default class SftaskerDataMove extends SFtaskerCommand<SftaskerDataMoveResult> {
  /** Summary of the command. */
  public static readonly summary = messages.commandMessages.getMessage('summary');

  /** Description of the command. */
  public static readonly description = messages.commandMessages.getMessage('description');

  /** Examples of how to use the command. */
  public static readonly examples = messages.commandMessages.getMessages('examples');

  /** Defines the flags/options for the command. */
  public static readonly flags = {
    /** Specifies the target Salesforce org. */
    'target-org': Flags.optionalOrg({
      summary: messages.commandMessages.getMessage('flags.target-org.summary'),
      char: 'o',
    }),

    /** Specifies the API version to use. */
    'api-version': Flags.orgApiVersion({
      char: 'a',
    }),

    /** Specifies the source Salesforce org. */
    'source-org': Flags.optionalOrg({
      summary: messages.commandMessages.getMessage('flags.source-org.summary'),
      char: 's',
    }),

    /** Indicates whether the source data is in CSV format. */
    'csv-source': Flags.boolean({
      summary: messages.commandMessages.getMessage('flags.csv-source.summary'),
    }),

    /** Indicates whether the target data should be exported to CSV format. */
    'csv-target': Flags.boolean({
      summary: messages.commandMessages.getMessage('flags.csv-target.summary'),
    }),

    /** Specifies the path to the configuration file. */
    'config-path': Flags.string({
      summary: messages.commandMessages.getMessage('flags.config-path.summary'),
      char: 'p',
      default: Constants.DATA_MOVE_CONSTANTS.DEFAULT_CONFIG_PATH,
    }),
  };

  /**
   * Executes the command to perform data movement based on the provided flags and configuration.
   *
   * @returns The result of the data move operation.
   */
  public async run(): Promise<SftaskerDataMoveResult> {
    // Parse the command-line flags provided by the user.
    const { flags } = await this.parse(SftaskerDataMove);

    // Initialize CommandUtils with the current command instance.
    const commandUtils = new CommandUtils(this);

    // Set up the command instance with the necessary messages and flags.
    commandUtils.setupCommandInstance(messages, flags);

    // Log a message indicating the start of the command execution.
    commandUtils.logCommandStartMessage();

    // Initialize DataMoveUtils with the current command instance to handle data movement operations.
    const dataMoveUtils = new DataMoveUtils(this);

    // Initialize and process the data move command asynchronously.
    await dataMoveUtils.initializeCommandAsync();

    // Log a message indicating the end of the command execution.
    commandUtils.logCommandEndMessage();

    // Return an empty result as defined by SftaskerDataMoveResult.
    return {};
  }
}