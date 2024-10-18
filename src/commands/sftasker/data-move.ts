import { Flags } from '@salesforce/sf-plugins-core';
import { CommandUtils } from '../../components/command-utils.js';
import { SFtaskerCommand } from '../../components/models.js';
import { Constants } from '../../components/constants.js';
import { DataMoveUtils } from '../../components/data-move/data-move-utils.js';
import { ApiUtils } from '../../components/api-utils.js';
import { OperationReportLevel, IngestJobInfo } from '../../components/types.js';
import { DataMoveUtilsStatic } from '../../components/data-move/data-move-utils-static.js';
import { ObjectExtraData } from '../../components/data-move/data-move-models.js';
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

    const apiUtils = new ApiUtils(this, dataMoveUtils.tempDir);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const numb = await apiUtils.queryBulkToFileAsync({
      query: 'SELECT Id, Name FROM Test_Big_Data_Volume__c LIMIT 5',
      filePath: './tmp/import.csv',
      appendToExistingFile: false,
      useSourceConnection: true,
      // eslint-disable-next-line arrow-body-style
      recordCallback: (record): any => {
        //record.Name =
        //record.Name +
        //'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua';
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return record;
      },
      progressCallback: (recordCount, filteredRecordCount) => {
        this.info(`Records processed: ${recordCount}, Filtered records: ${filteredRecordCount}`);
      },
    });

    this.info(`Number of records: ${numb}`);

    // const jobInfo = await apiUtils.updateBulk2Async({
    //   filePath: './tmp/import.csv',
    //   statusFilePath: './tmp/status.csv',
    //   operation: 'update',
    //   reportLevel: OperationReportLevel.Errors,
    //   sobjectType: 'Test_Big_Data_Volume__c',
    //   projectedCsvRecordsCount: 1000,
    //   useSourceConnection: true,
    //   progressCallback: (state: IngestJobInfo) => {
    //     this.info(
    //       `State: ${state.state},  Records processed: ${state.numberRecordsProcessed}, Filtered records: ${state.numberRecordsFailed}`
    //     );
    //   },
    // });

    // this.info(`Job ID: ${jobInfo?.recordCount}`);

    const jobInfo2 = await apiUtils.updateRestFromArrayAsync({
      records: [
        { Id: 'a1OJ7000001SYq8MAG', Name: 'TestName1' },
        { Id: 'a1OJ7000001SYq9MAG', Name: 'TestName2' },
      ],
      statusFilePath: './tmp/status2.csv',
      operation: 'update',
      reportLevel: OperationReportLevel.Errors,
      sobjectType: 'Test_Big_Data_Volume__c',
      useSourceConnection: true,
      progressCallback: (state: IngestJobInfo) => {
        this.info(
          `State: ${state.state},  Records processed: ${state.numberRecordsProcessed}, Filtered records: ${state.numberRecordsFailed}`
        );
      },
    });

    this.info(`Job2 ID: ${jobInfo2?.recordCount}`);

    const jobInfo3 = await apiUtils.updateRestFromFileAsync({
      filePath: './tmp/import.csv',
      statusFilePath: './tmp/status3.csv',
      operation: 'insert',
      reportLevel: OperationReportLevel.All,
      sobjectType: 'Test_Big_Data_Volume__c',
      projectedCsvRecordsCount: 1000,
      useSourceConnection: true,
      progressCallback: (state: IngestJobInfo) => {
        this.info(
          `State: ${state.state},  Records processed: ${state.numberRecordsProcessed}, Filtered records: ${state.numberRecordsFailed}`
        );
      },
    });

    this.info(`Job ID: ${jobInfo3?.recordCount}`);

    const extraData: ObjectExtraData = new ObjectExtraData({
      where: "Name <> 'ExcludedName'",
    });

    // Inline generation of 30,000 names
    const whereInClauses = DataMoveUtilsStatic.constructWhereInClause(
      'Name__c',
      Array.from({ length: 30_000 }, () => {
        const randomType = Math.floor(Math.random() * 3); // 0: string, 1: number, 2: date
        if (randomType === 0) {
          // Return a random string in the format 'nameX'
          return `name${Math.floor(Math.random() * 10_000) + 1}`;
        } else if (randomType === 1) {
          // Return a random number
          return Math.floor(Math.random() * 10_000);
        } else {
          // Return a random date within the past year
          const randomDate = new Date();
          randomDate.setDate(randomDate.getDate() - Math.floor(Math.random() * 365));
          return randomDate;
        }
      }),
      extraData.where
    );
    this.info(`Number of WHERE clauses constucted: ${whereInClauses.length}`);

    // Function to generate a random where clause in the format 'a=X AND b=Y'
    const generateRandomWhereClause = (): string => {
      const a = Math.floor(Math.random() * 1_000_000) + 1; // Random number between 1 and 1,000,000
      const b = Math.floor(Math.random() * 1_000_000) + 1; // Random number between 1 and 1,000,000
      return `a=${a} AND b=${b} AND (Account__c = '0012w00000J1Z3zAAF' OR Account__c = '0012w00000J1Z3zAAF')`;
    };

    // Generate an array of 30,000 random where clauses
    const randomWheres: string[] = Array.from({ length: 30_000 }, generateRandomWhereClause);

    // Construct the combined WHERE clauses using the 'OR' operand
    const whereOrClauses: string[] = DataMoveUtilsStatic.constructWhereOrAndClause(
      'OR', // Operand can be 'OR' or 'AND' based on your requirement
      randomWheres,
      extraData.where
    );

    // Log the number of constructed WHERE clauses
    this.info(`Number of WHERE clauses constructed: ${whereOrClauses.length}`);

    // Log a message indicating the end of the command execution.
    commandUtils.logCommandEndMessage();

    // Return an empty result as defined by SftaskerDataMoveResult.
    return {};
  }
}
