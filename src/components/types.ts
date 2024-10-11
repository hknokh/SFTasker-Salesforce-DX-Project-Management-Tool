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
