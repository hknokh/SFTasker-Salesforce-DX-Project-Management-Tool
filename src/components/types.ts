import { Readable } from 'node:stream';
import { Connection, Messages } from '@salesforce/core';

// ------ Command Types ------

/**
 * Represents the available metadata types for the sf tasker command.
 */
export type AvailableMetadataTypes = 'Profile' | 'CustomLabels' | 'Translations';

/**
 * Represents the data source type for the sf tasker command.
 */
export enum DataOriginType {
  csvfile = 'csvfile',
  org = 'org',
}

/**
 * Represents a Salesforce organization.
 * Provides methods to get connection details and the organization ID.
 */
export type SfOrg = {
  /**
   * Gets a connection object to the Salesforce org using the specified API version.
   * @param apiVersion The API version to use for the connection.
   * @returns The connection object.
   */
  getConnection: (apiVersion: string) => Connection;

  /**
   * Retrieves the Salesforce organization ID.
   * @returns The organization ID.
   */
  getOrgId: () => string;
};

/**
 * Represents the flags used in Sftasker commands.
 * Includes the target Salesforce org, source Salesforce org, API version, and various metadata and configuration options.
 */
export type SftaskerCommandFlags = {
  /** The target Salesforce organization. */
  'target-org'?: SfOrg;

  /** The source Salesforce organization. */
  'source-org'?: SfOrg;

  /** A flag indicating whether to use a CSV file as the source. */
  'csv-source'?: boolean;

  /** A flag indicating whether to use a CSV file as the target. */
  'csv-target'?: boolean;

  /** The API version to use for the command. */
  'api-version'?: string;

  /** The path to the configuration file. */
  'config-path'?: string;

  /** The path to the root folder of the metadata for the force-app project. */
  'source-dir'?: string;

  /** A flag indicating whether to deduplicate the metadata components, keeping only the version with the most inner properties. */
  dedup?: boolean;

  /** A flag indicating whether to merge the properties of the source and target sections when constructing the final section metadata. */
  'merge-props'?: boolean;

  /** The type of metadata to merge. */
  type?: AvailableMetadataTypes;

  /** A flag indicating whether to keep the temporary directories created during the command execution. */
  'keep-temp-dirs'?: boolean;
};

/**
 * Represents the messages for the Sftasker command.
 */
export type SftaskerCommandMessages = {
  /** Command-related messages. */
  commandMessages: Messages<string>;

  /** Component-related messages. */
  componentsMessages: Messages<string>;
};

/**
 * Represents the paths used in the SfTasker configuration.
 */
export type SfTaskerConfigPaths = {
  /** The path to the configuration file. */
  configFilePath?: string;

  /** The path to the configuration directory. */
  configDirPath?: string;
};

/**
 * Represents a type entity in the package.xml file.
 */
export type PackageXmlType = {
  /** The members of the metadata type. */
  members: string[];

  /** The name of the metadata type. */
  name: string;
};

/**
 * Represents package.xml file contents.
 */
export type PackageXmlContent = {
  /** The package types defined in the package.xml file. */
  Package?: {
    /** The types defined in the package.xml file. */
    types?: PackageXmlType[];

    /** The API version defined in the package.xml file. */
    version?: string;
  };
};

// ------ Utils Types ------

/**
 * Represents the matching files in two directories.
 */
export type MatchingFiles = {
  /** The path of the file in the first directory. */
  dir1Path: string;

  /** The path of the file in the second directory. */
  dir2Path: string;
};

/**
 * Represents the result of finding matching files in two directories.
 */
export type FindMatchingFilesResult = {
  /** The matching files in the two directories. */
  matchingFiles: MatchingFiles[];

  /** The files that are missing in one of the directories. */
  missingFiles: string[];
};

/**
 * Represents the replacement of a file name using a regular expression.
 */
export type FilenameRegexpReplacement = {
  /** The regular expression to match the file name. */
  regexp: RegExp;

  /** The replacement string for the file name. */
  replace: string;
};

// ------ Third-party Module Types ------

/**
 * Represents the module 'object-path' for accessing nested properties in objects by path.
 */
export type ObjectPath = {
  /**
   * Gets the value of a nested property in an object using a dot-delimited path.
   * @param obj The object to search.
   * @param path The dot-delimited path to the property.
   * @returns The value at the given path, or undefined if not found.
   */
  get: (obj: Record<string, any>, path: string) => any;
};

/**
 * Represents the module 'fast-deep-equal' for deep comparison of objects.
 */
export type FastDeepEqual = (obj1: Record<string, any>, obj2: Record<string, any>) => boolean;

/**
 * Represents a replacer function for safe JSON.stringify.
 */
export type FastSafeReplacer = (key: string, value: any) => any;

/**
 * Represents a function for safe JSON.stringify.
 */
export type FastSafeStringify = (
  value: any,
  replacer?: FastSafeReplacer | Array<number | string> | null,
  space?: string | number
) => string;

/**
 * Represent status of the Bulk API V2 job.
 * @param recordCount - The total number of records processed.
 * @param filteredRecordCount - The number of records that match the filter criteria.
 * @param numberRecordsProcessed - The number of records processed.
 * @param numberRecordsFailed - The number of records failed.
 * @param state - The state of the job.
 * @param errorMessage - The error message if the job failed.
 */
export type JobInfoV2 = {
  recordCount?: number;
  numberRecordsProcessed: number;
  numberRecordsFailed: number;
  state:
    | 'Initializing'
    | 'Uploading'
    | 'CreatingReports'
    | 'Open'
    | 'UploadComplete'
    | 'InProgress'
    | 'JobComplete'
    | 'Aborted'
    | 'Failed';
  errorMessage?: string;
};

/**
 * Defines the structure and methods of a Bulk2 Job.
 */
export type IngestJobV2 = {
  /**
   * Opens the job for data upload.
   * @returns A promise that resolves when the job is successfully opened.
   */
  open(): Promise<Partial<JobInfoV2>>;

  /**
   * Checks the current status of the job.
   * @returns A promise that resolves with the job's current information.
   */
  check(): Promise<JobInfoV2>;

  /**
   * Uploads data to the job from a readable stream.
   * @param stream - The readable stream containing CSV data.
   * @returns A promise that resolves when the data upload is complete.
   */
  uploadData(stream: Readable): Promise<void>;

  /**
   * Closes the job after data upload.
   * @returns A promise that resolves when the job is successfully closed.
   */
  close(): Promise<void>;

  /**
   * Polls the job status at specified intervals until completion or timeout.
   * @param interval - The polling interval in milliseconds.
   * @param timeout - The maximum time to wait for job completion in milliseconds.
   * @returns A promise that resolves when polling is complete.
   */
  poll(interval: number, timeout: number): Promise<void>;

  /**
   * Retrieves the successful results of the job.
   * @returns A promise that resolves with an array of successful result records.
   */
  getSuccessfulResults(): Promise<JobResultV2[]>;

  /**
   * Retrieves the failed results of the job.
   * @returns A promise that resolves with an array of failed result records.
   */
  getFailedResults(): Promise<JobResultV2[]>;
};

// Metadata Types ----------------------------------------------------------------

/**
 * Represents the properties of an SObject field.
 */
export type Field = {
  /** The name of the field. */
  name: string;

  /** The label of the field. */
  label: string;

  /** The data type of the field. */
  type: string;

  /** The length of the field. */
  length?: number;

  /** The precision of the field. */
  precision?: number;

  /** The scale of the field. */
  scale?: number;

  /** Indicates if the field is nillable. */
  nillable: boolean;

  /** Indicates if the field has a default value on create. */
  defaultedOnCreate: boolean;

  /** Indicates if the field is calculated. */
  calculated: boolean;

  /** Indicates if the field is filterable. */
  filterable: boolean;

  /** Indicates if the field is sortable. */
  sortable: boolean;

  /** Indicates if the field is updateable. */
  updateable: boolean;

  /** Indicates if the field is createable. */
  createable: boolean;

  /** Indicates if the field is unique. */
  unique: boolean;

  /** Indicates if the field is case-sensitive. */
  caseSensitive?: boolean;

  /** Indicates if the field is a restricted picklist. */
  restrictedPicklist?: boolean;

  /** The picklist values for the field. */
  picklistValues?: any[];

  /** The sObjects that the field references. */
  referenceTo?: string[];

  /** Indicates if the field is a name field. */
  nameField?: boolean;

  /** Indicates if the field is an auto-number field. */
  autoNumber?: boolean;

  /** Indicates if the field supports cascade delete. */
  cascadeDelete?: boolean;
};

/**
 * Represents the properties of an SObject.
 */
export type DescribeSObjectResult = {
  /** The name of the sObject. */
  name: string;

  /** The label of the sObject. */
  label: string;

  /** Indicates if the sObject is custom. */
  custom: boolean;

  /** The key prefix for the sObject. */
  keyPrefix: string;

  /** The fields of the sObject. */
  fields: Field[];
};

// Method Parameters ----------------------------------------------------------------
/**
 *  which records should be reported after the api operation completes.
 */
export enum ApiOperationReportLevel {
  'None' = 'None',
  'All' = 'All',
  'Errors' = 'Errors',
  'Inserts' = 'Inserts',
}

/**
 * Represents the type of an API operation.
 */
export type ApiOperation = 'insert' | 'update' | 'delete' | 'hardDelete';

/**
 * Represetns parameters for an asynchronous query operation.
 * @property query - The query to run.
 * @property filePath - The path to the file to write the results to.
 * @property appendToExistingFile - Indicates whether to append to an existing file.
 * @property useSourceConnection - Indicates whether to use the source connection.
 * @property recordCallback - A callback function to process each record.
 * @property progressCallback - A callback function to report progress.
 */
export type QueryAsyncParameters = {
  query: string;
  filePath: string;
  appendToExistingFile?: boolean;
  useSourceConnection?: boolean;
  /**
   *  A callback function to process each record.
   * @param rawRecord  - The raw record returned by the query.
   * @returns  The transformed record to write to the output file or array.
   *          If not provided, the raw record will be ignored.
   */
  recordCallback?: (rawRecord: any) => any;
  /**
   * A callback function to report progress.
   * @param recordCount - The number of records processed.
   * @param filteredRecordCount - The number of records that match the filter criteria.
   */
  progressCallback?: (recordCount: number, filteredRecordCount: number) => void;
};

/**
 * Represents parameters for an asynchronous update operation.
 * @property filePath - The path to the file to write the results to. If `records` is provided, `filePath` will be ignored.
 * @property statusFilePath - The path to the file to write the job status to.
 * @property sobjectType - The type of the sObject to update.
 * @property operation -  The operation to perform (insert, update, delete, hardDelete).
 * @property reportLevel - The level of records to report after the operation completes. Default is 'None'.
 * @property records - The records use for the operation.
 * @property projectedRecordsCount - The projected number of records to update.
 *            Used to optionally calculate optimal polling settings if csv file is used as a source.
 * @property useSourceConnection - Indicates whether to use the source connection.
 * @property progressCallback - A callback function to report progress.
 */
export type UpdateAsyncParameters = {
  filePath: string;
  statusFilePath?: string;
  sobjectType: string;
  operation: ApiOperation;
  reportLevel?: ApiOperationReportLevel;
  records?: any[];
  projectedCsvRecordsCount?: number;
  useSourceConnection?: boolean;
  /**
   * A callback function to report progress.
   * @param jobInfo - The current job information.
   */
  progressCallback?: (jobInfo: JobInfoV2) => void;
};

/**
 *  Represents the result of an ingest job.
 */
export type JobResultV2 = {
  sf__Id: string;
  sf__Created?: 'true' | 'false';
  sf__Error?: string;
  Status?: 'Success' | 'Error';
};
