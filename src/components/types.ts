import { Connection, Messages } from '@salesforce/core';

// ------ Command Types ------

/**
 * Represents the avaliable metadata types for the sf tasker command.
 */
export type AvailableMetadataTypes = 'Profile' | 'CustomLabels' | 'Translations';

/**
 * Represents a Salesforce organization.
 * Provides methods to get connection details and the organization ID.
 */
export type SfOrg = {
  /**
   * Gets a connection object to the Salesforce org using the specified API version.
   * @param {string} apiVersion - The API version to use for the connection.
   * @returns {Connection} - The connection object.
   */
  getConnection: (apiVersion: string) => Connection;

  /**
   * Retrieves the Salesforce organization ID.
   * @returns {string} - The organization ID.
   */
  getOrgId: () => string;
};

/**
 * Represents the flags used in Sftasker commands.
 * Includes the target Salesforce org, source Salesforce org, API version, and various metadata and configuration options.
 */
export type SftaskerCommandFlags = {
  /**
   * The target Salesforce organization.
   * @type {SfOrg | undefined}
   */
  'target-org'?: SfOrg;

  /**
   * The source Salesforce organization.
   * @type {SfOrg | undefined}
   */
  'source-org'?: SfOrg;

  /**
   * A flag indicating whether to use a CSV file as the source.
   * @type {boolean | undefined}
   */
  'csv-source'?: boolean;

  /**
   * A flag indicating whether to use a CSV file as the target.
   * @type {boolean | undefined}
   */
  'csv-target'?: boolean;

  /**
   * The API version to use for the command.
   * @type {string | undefined}
   */
  'api-version'?: string;

  /**
   * The path to the configuration file.
   * @type {string | undefined}
   */
  'config-path'?: string;

  /**
   * The path to the root folder of the metadata for the force-app project.
   * @type {string | undefined}
   */
  'metadata-root-folder'?: string;

  /**
   * A flag indicating whether to deduplicate the metadata components, keeping only the version with the most inner properties.
   * @type {boolean | undefined}
   */
  dedup?: boolean;

  /**
   * A flag indicating whether to merge the properties of the source and target sections when constructing the final section metadata.
   * @type {boolean | undefined}
   */
  'merge-props'?: boolean;

  /**
   * The type of metadata to merge.
   * @type {AvailableMetadataTypes | undefined}
   */
  type?: AvailableMetadataTypes;

  /**
   * A flag indicating whether to keep the temporary directories created during the command execution.
   * @type {boolean | undefined}
   */
  'keep-temp-dirs'?: boolean;
};

/**
 * Represents the messages for the Sftasker command.
 */
export type SftaskerCommandMessages = {
  commandMessages: Messages<string>;
  componentsMessages: Messages<string>;
};

export type SfTaskerConfigPaths = {
  /**
   * The path to the configuration file.
   */
  configFilePath?: string;

  /**
   * The path to the configuration directory.
   */
  configDirPath?: string;
};

/**
 *  Represents a type entity in the package.xml file.
 */
export type PackageXmlType = {
  /**
   *  The name of the metadata type.
   */
  members: string[];

  /**
   * The name of the metadata type.
   */
  name: string;
};

/**
 * Represents package.xml file contents.
 */
export type PackageXmlContent = {
  /**
   * The package types defined in the package.xml file.
   */
  Package?: {
    /**
     * The types defined in the package.xml file.
     */
    types?: PackageXmlType[];
    /**
     * The API version defined in the package.xml file.
     */
    version?: string;
  };
};

// ------ Utils Types ------

/**
 * Represents the matching files in two directories.
 */
export type MatchingFiles = {
  /**
   * The path of the file in the first directory.
   */
  dir1Path: string;
  /**
   * The path of the file in the second directory.
   */
  dir2Path: string;
};

/**
 * Represents the result of finding matching files in two directories.
 */
export type FindMatchingFilesResult = {
  /**
   * The matching files in the two directories.
   */
  matchingFiles: MatchingFiles[];
  /**
   * The files that are missing in one of the directories.
   */
  missingFiles: string[];
};

/**
 * Represents the replacement of a file name using a regular expression.
 */
export type FilenameRegexpReplacement = {
  /**
   * The regular expression to match the file name.
   */
  regexp: RegExp;
  /**
   * The replacement string for the file name.
   */
  replace: string;
};

// ------ Third-party Module Types ------
/**
 * Represents the module 'object-path' for accessing nested properties in objects by path.
 */
export type ObjectPath = {
  /**
   * Gets the value of a nested property in an object using a dot-delimited path.
   * @param {Record<string, any>} obj - The object to search.
   * @param {string} path - The dot-delimited path to the property.
   * @returns {any} - The value at the given path, or undefined if not found.
   */
  get: (obj: Record<string, any>, path: string) => any;
};

/**
 * Represents the module 'fast-deep-equal' for deep comparison of objects.
 */
export type FastDeepEqual = (obj1: Record<string, any>, obj2: Record<string, any>) => boolean;
