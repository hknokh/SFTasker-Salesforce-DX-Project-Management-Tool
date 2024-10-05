import { Flags } from '@salesforce/sf-plugins-core';
import { CommandUtils } from '../../components/command-utils.js';
import { SFtaskerCommand } from '../../components/models.js';
import { Constants } from '../../components/constants.js';
import { DataMoveUtils } from '../../components/data-move/data-move-utils.js';

export type SftaskerDataMoveResult = Record<string, never>;

// Set up the command messages
const messages = CommandUtils.setupCommandMessages('sftasker', 'data-move');

// eslint-disable-next-line sf-plugin/only-extend-SfCommand
export default class SftaskerDataMove extends SFtaskerCommand<SftaskerDataMoveResult> {
  public static readonly summary = messages.commandMessages.getMessage('summary');
  public static readonly description = messages.commandMessages.getMessage('description');
  public static readonly examples = messages.commandMessages.getMessages('examples');

  // eslint-disable-next-line sf-plugin/spread-base-flags
  public static readonly flags = {
    'target-org': Flags.optionalOrg({
      summary: messages.commandMessages.getMessage('flags.target-org.summary'),
      char: 'o',
    }),
    apiversion: Flags.orgApiVersion(),

    'source-org': Flags.optionalOrg({
      summary: messages.commandMessages.getMessage('flags.source-org.summary'),
      char: 's',
    }),

    'csv-source': Flags.boolean({
      summary: messages.commandMessages.getMessage('flags.csv-source.summary'),
      char: 'c',
    }),

    'csv-target': Flags.boolean({
      summary: messages.commandMessages.getMessage('flags.csv-target.summary'),
      char: 't',
    }),

    'config-path': Flags.string({
      summary: messages.commandMessages.getMessage('flags.config-path.summary'),
      char: 'p',
      default: Constants.DATA_MOVE_CONSTANTS.DEFAULT_CONFIG_PATH,
    }),
  };

  public async run(): Promise<SftaskerDataMoveResult> {
    const { flags } = await this.parse(SftaskerDataMove);

    // Set up the command utils
    const commandUtils = new CommandUtils(this);

    // Set up the command with the necessary properties
    commandUtils.setupCommandInstance(messages, flags);

    const dataMoveUtils = new DataMoveUtils(this);

    this.log(`Config path: ${dataMoveUtils.configDir}`);

    // Log the command start message
    commandUtils.logCommandStartMessage();

    // Command logic goes here...

    // Log the command end message
    commandUtils.logCommandEndMessage();

    return {};
  }
}
