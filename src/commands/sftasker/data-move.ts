import { Flags } from '@salesforce/sf-plugins-core';
import { CommandUtils } from '../../components/command-utils.js';
import { SFtaskerCommand } from '../../components/models.js';
import { Constants } from '../../components/constants.js';
import { DataMoveUtils } from '../../components/data-move/data-move-utils.js';
import { MetadataUtils } from '../../components/metadata-utils.js';
import { JobInfoV2 } from '../../components/types.js';
//import { ObjectExtraData } from '../../components/data-move/data-move-models.js';
//import { DataMoveUtilsStatic } from '../../components/data-move/data-move-utils-static.js';

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
    //await dataMoveUtils.initializeCommandAsync();

    const metaUtils = new MetadataUtils(this, dataMoveUtils.tempDir);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const numb = await metaUtils.queryBulkToFileAsync({
      query: 'SELECT Id, Name FROM Test_Big_Data_Volume__c LIMIT 100',
      filePath: './tmp/import.csv',
      appendToExistingFile: false,
      useSourceConnection: true,
      recordCallback: (record): any => {
        record.Name =
          record.Name +
          'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua';
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return record;
      },
      progressCallback: (recordCount, filteredRecordCount) => {
        this.info(`Records processed: ${recordCount}, Filtered records: ${filteredRecordCount}`);
      },
    });

    this.info(`Number of records: ${numb}`);

    const jobInfo = await metaUtils.updateBulk2Async({
      filePath: './tmp/import.csv',
      statusFilePath: './tmp/status.csv',
      operation: 'update',
      sobjectType: 'Test_Big_Data_Volume__c',
      useSourceConnection: true,
      progressCallback: (state: JobInfoV2) => {
        this.info(
          `State: ${state.state},  Records processed: ${state.numberRecordsProcessed}, Filtered records: ${state.numberRecordsFailed}`
        );
      },
    });

    this.info(`Job ID: ${jobInfo?.recordCount}`);

    // const extraData: ObjectExtraData = new ObjectExtraData({
    //   where: "Name <> 'ExcludedName'",
    // });

    // // Inline generation of 30,000 names
    // const whereInClauses = DataMoveUtilsStatic.constructWhereInClause(
    //   'Name__c',
    //   Array.from({ length: 30_000 }, () => {
    //     const randomType = Math.floor(Math.random() * 3); // 0: string, 1: number, 2: date
    //     if (randomType === 0) {
    //       // Return a random string in the format 'nameX'
    //       return `name${Math.floor(Math.random() * 10_000) + 1}`;
    //     } else if (randomType === 1) {
    //       // Return a random number
    //       return Math.floor(Math.random() * 10_000);
    //     } else {
    //       // Return a random date within the past year
    //       const randomDate = new Date();
    //       randomDate.setDate(randomDate.getDate() - Math.floor(Math.random() * 365));
    //       return randomDate;
    //     }
    //   }),
    //   extraData.where
    // );
    // this.info(`Number of records: ${whereInClauses}`);

    // Log a message indicating the end of the command execution.
    commandUtils.logCommandEndMessage();

    // Return an empty result as defined by SftaskerDataMoveResult.
    return {};
  }
}
