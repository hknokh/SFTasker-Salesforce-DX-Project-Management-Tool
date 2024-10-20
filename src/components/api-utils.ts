/* eslint-disable camelcase */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { once } from 'node:events';
import * as os from 'node:os';
import { stringify } from 'csv-stringify';
import csvParser from 'csv-parser';
import { parse } from 'csv-parse/sync';

import { Connection } from '@salesforce/core';
import * as unzipper from 'unzipper';

import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { Constants } from './constants.js';
import { SFtaskerCommand, SObjectDescribe } from './models.js';
import { CommandUtils } from './command-utils.js';
import { Utils } from './utils.js';
import {
  XmlSectionKey,
  DescribeSObjectResult,
  IngestJob,
  IngestJobInfo,
  IngestJobResult,
  OperationReportLevel,
  PackageXmlContent,
  PackageXmlType,
  QueryAsyncParameters,
  UpdateAsyncParameters,
  EngineChoice,
  PollingChoice,
} from './types.js';

/**
 *  Utility class for common API operations.
 */
export class ApiUtils<T> {
  /** Default path for force-app project main folder. */
  private static _forceAppProjectMainDefaultPath: string;

  /**
   * Creates a new instance of the ApiUtils class.
   * @param command The command object used to retrieve metadata.
   * @param outputDir The output directory for the retrieved metadata.
   */
  public constructor(private command: SFtaskerCommand<T>, private outputDir?: string) {}

  // Public static methods ----------------------------------------------------------

  /**
   * Checks if the current project is a force-app project.
   * @returns True if the project is a force-app project, false otherwise.
   */
  public static isForceAppProject(): boolean {
    return fs.existsSync(path.join(process.cwd(), Constants.FORCE_APP_SFDX_PROJECT_JSON));
  }

  /**
   * Gets the default path to the force-app project main folder from the sfdx-project.json file.
   * @returns The default path to the force-app project main folder.
   */
  public static getForceAppProjectMainDefaultPath(): string {
    // Use the cached value if it exists
    if (ApiUtils._forceAppProjectMainDefaultPath) {
      return ApiUtils._forceAppProjectMainDefaultPath;
    }
    // Check if the project is a force-app project
    if (ApiUtils.isForceAppProject()) {
      // Read the sfdx-project.json file
      const sfdxProjectJsonPath = path.join(process.cwd(), Constants.FORCE_APP_SFDX_PROJECT_JSON);
      const sfdxProjectJson = fs.readFileSync(sfdxProjectJsonPath, Constants.DEFAULT_ENCODING);
      const sfdxProjectJsonObj = JSON.parse(sfdxProjectJson);
      const packageDirectories: any[] = sfdxProjectJsonObj.packageDirectories;
      // Find the package directory with the default property set to true
      const forceAppProjectMainDefaultPath = packageDirectories.find(
        (packageDirectory: any) => packageDirectory.default
      );
      if (forceAppProjectMainDefaultPath) {
        // Cache the value and return it
        ApiUtils._forceAppProjectMainDefaultPath = forceAppProjectMainDefaultPath.path;
        return ApiUtils._forceAppProjectMainDefaultPath;
      }
    }
    // Set the default path to the force-app project main folder
    ApiUtils._forceAppProjectMainDefaultPath = Constants.FORCE_APP_PROJECT_ROOT_MAIN_DEFAULT_PATH;
    return ApiUtils._forceAppProjectMainDefaultPath;
  }

  /**
   * Suggests polling settings for a bulk job based on the number of records to process.
   * @param recordCount The number of records to process.
   * @returns An object containing the suggested polling interval and timeout.
   */
  public static suggestPollingSettings(recordCount?: number): PollingChoice {
    recordCount = recordCount || Constants.BULK_API_POLL_RECORD_SCALE_FACTOR;

    // Define base interval and timeout for small jobs (under 100K records)
    const basePollInterval = Constants.BULK_API_POLL_MIN_INTERVAL; // Min 10 seconds
    const basePollTimeout = Constants.BULK_API_POLL_MAX_TIMEOUT; // Max 1 hour

    // Scale factor based on the number of records
    const scaleFactor = Math.ceil(recordCount / Constants.BULK_API_POLL_RECORD_SCALE_FACTOR); // Scale every 100K records

    // Calculate pollInterval (increase interval as records grow, max at 30 seconds)
    const pollInterval = Math.min(basePollInterval * scaleFactor, Constants.BULK_API_POLL_MAX_INTERVAL); // max 30 seconds

    // Calculate pollTimeout (increase timeout proportionally to record count)
    const pollTimeout = basePollTimeout * scaleFactor;

    return { pollInterval, pollTimeout };
  }

  /**
   * Suggests whether to use Bulk API or REST API and whether to query all records or a subset.
   * Calculates based on Bulk V1 specifications.
   * @param totalRecordsCount Total count of records to query.
   * @param subsetRecordsCount Number of records  in the subset to query.
   * @param queryAmountsForSubset Number of queries needed to query the subset.
   * @returns An object indicating the best API and query strategy to use.
   */
  public static suggestQueryEngine(
    totalRecordsCount: number,
    subsetRecordsCount: number,
    queryAmountsForSubset: number
  ): EngineChoice {
    if (totalRecordsCount <= 0) {
      return {
        skipApiCall: true,
      };
    }

    // Calculate the number of REST API jobs needed to query all records
    const restApiJobsForAll = Math.ceil(totalRecordsCount / Constants.REST_API_MAX_RECORDS_PER_CALL);

    // Number of Bulk API jobs needed to query all records
    const bulkApiJobsForAll = Math.ceil(totalRecordsCount / Constants.BULK_API_MAX_RECORDS_PER_BATCH);

    // Penalty for processing extra records when querying all records instead of the subset
    const extraRecordsPenalty = (totalRecordsCount - subsetRecordsCount) / totalRecordsCount;

    // Cost functions for each option
    const costRestApiSubset = queryAmountsForSubset;
    const costBulkApiSubset = queryAmountsForSubset;

    const costRestApiAll = restApiJobsForAll + extraRecordsPenalty;
    const costBulkApiAll = bulkApiJobsForAll + extraRecordsPenalty;

    // Determine the minimum cost option
    const minCost = Math.min(costRestApiSubset, costBulkApiSubset, costRestApiAll, costBulkApiAll);

    // Suggest the best API and query strategy based on the minimum cost
    if (minCost === costRestApiSubset) {
      return {
        shouldUseBulkApi: false,
        shouldQueryAllRecords: false,
      };
    } else if (minCost === costBulkApiSubset) {
      return {
        shouldUseBulkApi: true,
        shouldQueryAllRecords: false,
      };
    } else if (minCost === costRestApiAll) {
      return {
        shouldUseBulkApi: false,
        shouldQueryAllRecords: true,
      };
    } else {
      // minCost === costBulkApiAll
      return {
        shouldUseBulkApi: true,
        shouldQueryAllRecords: true,
      };
    }
  }

  /**
   * Suggests whether to use Bulk API V2 or REST API for updating records.
   * @param totalRecordsCount Total count of records to update.
   * @returns An object indicating the best API to use for updating records.
   */
  public static suggestUpdateEngine(totalRecordsCount: number): EngineChoice {
    if (totalRecordsCount <= 0) {
      return {
        skipApiCall: true,
      };
    }

    // Time or cost constants (arbitrary units for comparison)
    const REST_API_BASE_COST_PER_CALL = 0.1;
    const REST_API_COST_PER_RECORD = 0.001;

    const BULK_API_BASE_COST_PER_JOB = 1;
    const BULK_API_COST_PER_RECORD = 0.0005;

    // Calculate the number of REST API calls needed
    const restApiCalls = Math.ceil(totalRecordsCount / Constants.REST_API_MAX_RECORDS_PER_BATCH);

    // Total cost for REST API
    const totalRestApiCost = restApiCalls * REST_API_BASE_COST_PER_CALL + totalRecordsCount * REST_API_COST_PER_RECORD;

    // Calculate the number of Bulk API jobs needed
    const bulkApiJobs = Math.ceil(totalRecordsCount / Constants.BULK_API_MAX_RECORDS_PER_BATCH);

    // Total cost for Bulk API
    const totalBulkApiCost = bulkApiJobs * BULK_API_BASE_COST_PER_JOB + totalRecordsCount * BULK_API_COST_PER_RECORD;

    // Decide which API to use based on the total cost
    if (totalRestApiCost <= totalBulkApiCost) {
      return { shouldUseBulkApi: false };
    } else {
      return { shouldUseBulkApi: true };
    }
  }

  /**
   * Expands a Salesforce record by flattening nested referenced fields and removing original nested properties.
   *
   * @param record - The original Salesforce record object.
   * @returns A new object with expanded nested fields and without original nested reference properties.
   */
  public static expandSObjectRecord(record: Record<string, any>): Record<string, any> {
    /**
     * Recursively traverses the object to find and expand nested references.
     *
     * @param obj - The current object to traverse.
     * @param parentPath - The accumulated path representing the nesting.
     * @param parentObj - The immediate parent object of the current object.
     * @param keyInParent - The key of the current object in its parent object.
     */
    const recurse = (
      obj: Record<string, any>,
      parentPath: string | null,
      parentObj: Record<string, any> | null,
      keyInParent: string | null
    ): void => {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const key of Object.keys(obj)) {
          const value = obj[key];

          if (key === 'attributes') {
            // Skip 'attributes' properties
            continue;
          }

          // Build the new path
          const newPath = parentPath ? `${parentPath}.${key}` : key;

          if (value && typeof value === 'object' && !Array.isArray(value)) {
            // Recurse into nested object
            recurse(value, newPath, obj, key);
          } else {
            // Add the flattened property to the expanded object
            record[newPath] = value;
          }
        }

        // After processing, delete the original nested reference from its parent
        if (parentObj && keyInParent) {
          delete parentObj[keyInParent];
        } else if (!parentObj && keyInParent) {
          // If at the top level, delete from expanded
          delete record[keyInParent];
        }
      }
    };

    // Start the recursion with the original record
    recurse(record, null, null, null);

    return record;
  }

  // Private static methods ----------------------------------------------------------

  /**
   * Extracts the key value from a section object using a mapping of section names to key names.
   * @param sectionObject The section object to extract the key from.
   * @param sectionKeyMapping A mapping of section names to key names.
   * @returns An object containing the key value and a boolean indicating if the section exists.
   */
  private static _extractSectionKey(sectionObject: any, sectionKeyMapping: Record<string, string>): XmlSectionKey {
    let keyValue: XmlSectionKey = {
      key: '',
      isSectionExist: false,
    };
    let propIndex = -1;

    // Get the key value for a section from an array of properties by the given section name and key name
    // Key is a combination of section name, key name, and key value
    const getSectionKeyValue = (sectionArray: any[], sectionName: string, keyName: string): XmlSectionKey => {
      const keyArrayObject: any = sectionArray.find((item) => item[keyName]);
      if (keyArrayObject) {
        const keyArray: any[] = keyArrayObject[keyName];
        if (keyArray) {
          const keyObject = keyArray.find((item) => item['#text']);
          if (keyObject) {
            return {
              key: `${sectionName}_${keyName}_${keyObject['#text']}`,
              isSectionExist: true,
              sectionName,
              keyName,
              keyValue: keyObject['#text'],
            };
          }
        }
      } else if (keyName === '') {
        return {
          key: `${sectionName}`,
          isSectionExist: true,
          sectionName,
          keyName: '',
          keyValue: '',
        };
      }
      return {
        key: '',
        isSectionExist: true,
        sectionName,
      };
    };

    const updateSectionKeyValue = (
      sectionArray: any[],
      sectionName: string,
      keyName: string,
      sectionKeyToUpdate: XmlSectionKey
    ): XmlSectionKey => {
      if (!sectionKeyToUpdate.key) {
        return sectionKeyToUpdate;
      }
      const keyArrayObject: any = sectionArray.find((item) => item[keyName]);
      if (keyArrayObject) {
        const keyArray: any[] = keyArrayObject[keyName];
        if (keyArray) {
          const keyObject = keyArray.find((item) => item['#text']);
          if (keyObject) {
            const keyName2 = `${sectionKeyToUpdate.keyName}#${keyName}`;
            const keyValue2 = `${sectionKeyToUpdate.keyValue}#${keyObject['#text']}`;
            return {
              key: `${sectionName}_${keyName2}_${keyValue2}`,
              isSectionExist: true,
              sectionName,
              keyName: keyName2,
              keyValue: keyValue2,
            };
          }
        }
      }
      return sectionKeyToUpdate;
    };

    // Iterate through each property in the section object and look for the property containing the section
    for (const sectionName of Object.keys(sectionObject)) {
      propIndex++;
      // Check if the section name is in the mapping or if there is a wildcard mapping matching every section name
      if (sectionKeyMapping[sectionName] || sectionKeyMapping['*']) {
        // Try to get the array of properties for the section
        const sectionArray: any[] = sectionObject[sectionName];
        // Get the key name for the section
        let keyName = sectionKeyMapping[sectionName];
        // If the key name is not found and there is a wildcard mapping, use the wildcard mapping as the key name
        if (!keyName && sectionKeyMapping['*'] && propIndex === 0) {
          keyName = sectionKeyMapping['*'];
        }
        // If the key name is still not found, continue to the next section
        if (!keyName) {
          continue;
        }

        // Get the key value for the section
        const keyNames = keyName.split(',');
        keyValue = getSectionKeyValue(sectionArray, sectionName, keyNames[0]);
        for (let i = 1; i < keyNames.length; i++) {
          keyValue = updateSectionKeyValue(sectionArray, sectionName, keyNames[i], keyValue);
        }
        break;
      }
    }
    return keyValue;
  }

  /**
   * Merges metadata properties from the source object into the target object.
   * @param targetObject The target metadata object to update.
   * @param sourceObject The source metadata object.
   * @returns True if both objects are equal, otherwise false.
   */
  private static _mergeMetadataProperties(targetObject: any, sourceObject: any): boolean {
    let isEquals = true;
    if (targetObject === undefined || sourceObject === undefined) {
      return false;
    }
    if (!Array.isArray(targetObject) || !Array.isArray(sourceObject)) {
      return false;
    }
    sourceObject.forEach((sourceProp) => {
      const sourcePropName = Object.keys(sourceProp)[0];
      const sourcePropObject = sourceProp[sourcePropName];
      const targetProp = targetObject.find((prop) => Object.keys(prop)[0] === sourcePropName);
      if (!targetProp) {
        isEquals = false;
        targetObject.push(sourceProp);
      } else {
        const targetPropName = Object.keys(targetProp)[0];
        const targetPropObject = targetProp[targetPropName];
        if (!Utils.deepCompare(targetPropObject, sourcePropObject)) {
          isEquals = false;
        }
        targetProp[targetPropName] = sourcePropObject;
      }
    });
    return isEquals;
  }

  // Instance methods ----------------------------------------------------------

  /**
   * Retrieves metadata from the target org using the command's connection.
   * @param metadataTypeName Name of the metadata type to retrieve, for example, `Profile`.
   * @param members List of metadata members to retrieve, defaults to `*` if not provided.
   * @returns The path to the temporary output directory containing the retrieved metadata, or undefined if retrieval fails.
   */
  public async retrieveSingleMetadataAsync(metadataTypeName: string, members?: string[]): Promise<string | undefined> {
    const utils = new CommandUtils(this.command);
    try {
      // Log the progress of the metadata retrieval
      utils.spinnerwithComponentMessage('start', 'progress.retrieving-metadata', metadataTypeName);

      const tempOutputDir = fs.mkdtempSync(path.join(this.outputDir!, `${metadataTypeName}-`));
      const zipStream = this.command.connection.metadata
        .retrieve({
          apiVersion: Number(Constants.DEFAULT_API_VERSION),
          singlePackage: true,
          unpackaged: {
            types: [
              {
                name: metadataTypeName,
                members: members ?? ['*'],
              } as PackageXmlType,
            ],
            version: Constants.DEFAULT_API_VERSION,
            objectPermissions: [],
          },
        })
        .stream();

      // Unzip and process files
      return await new Promise<string>((resolve) => {
        let pendingWrites = 0; // Counter for pending write streams
        let unzipFinished = false; // Flag to indicate if unzip has finished

        zipStream
          .pipe(unzipper.Parse())
          .on('entry', (entry: unzipper.Entry) => {
            const filePath = path.join(tempOutputDir, entry.path);
            const directory = path.dirname(filePath);

            // Create directories if they don't exist
            fs.mkdirSync(directory, { recursive: true });

            // If entry is a file, write it to the output directory
            if (entry.type === 'File') {
              pendingWrites++; // Increment pending writes counter

              const writeStream = fs.createWriteStream(filePath);

              // Pipe the entry to the write stream
              entry.pipe(writeStream);

              // Ensure the write stream is properly closed after writing
              writeStream.on('finish', () => {
                writeStream.close();
                pendingWrites--; // Decrement pending writes counter

                // If unzip is finished and no pending writes, resolve the promise
                if (unzipFinished && pendingWrites === 0) {
                  utils.spinnerwithComponentMessage('stop', 'success.retrieving-metadata', metadataTypeName);
                  resolve(tempOutputDir);
                }
              });
            } else {
              entry.autodrain(); // Skip directories
            }
          })
          .on('error', (err: Error) => {
            utils.throwWithErrorMessage(err, 'error.retrieving-metadata', metadataTypeName);
          })
          .on('close', () => {
            unzipFinished = true; // Set unzip finished flag

            // If no pending writes, resolve the promise
            if (pendingWrites === 0) {
              utils.spinnerwithComponentMessage('stop', 'success.retrieving-metadata', metadataTypeName);
              resolve(tempOutputDir);
            }
          });
      });
    } catch (err) {
      utils.throwWithErrorMessage(err as Error, 'error.retrieving-metadata', metadataTypeName);
    }
  }

  /**
   * Retrieves package metadata and extracts it to a temporary directory.
   * @param packagePath The path of the package to retrieve.
   * @returns The path to the temporary output directory containing the retrieved package metadata, or undefined if retrieval fails.
   */
  public async retrievePackageMetadataAsync(packagePath: string): Promise<string | undefined> {
    const utils = new CommandUtils(this.command);
    try {
      // Log the progress of the metadata retrieval
      utils.spinnerwithComponentMessage('start', 'progress.retrieving-metadata', packagePath);

      // Read and parse the package.xml file
      const packageManifest = (await Utils.loadXmlAsJsonAsync(packagePath)) as PackageXmlContent;

      // Ensure types are arrays
      // eslint-disable-next-line eqeqeq
      if (packageManifest.Package?.types != undefined && !Array.isArray(packageManifest.Package.types)) {
        packageManifest.Package.types = [packageManifest.Package.types];
      }

      if (!packageManifest.Package?.types?.length) {
        utils.throwError('error.retrieving-package.no-package-tag');
      }

      // Normalize the structure of packageManifest.Package.types
      let types = packageManifest?.Package?.types ?? [];
      if (!Array.isArray(types)) {
        types = [types];
      }

      // Ensure members are arrays
      types.forEach((typeEntry: PackageXmlType) => {
        const updateTypeEntry = typeEntry;
        if (!Array.isArray(typeEntry.members)) {
          updateTypeEntry.members = [typeEntry.members];
        }
      });

      // Create a temporary directory for the package
      const tempOutputDir = fs.mkdtempSync(path.join(this.outputDir!, 'Package-'));

      // Start the metadata retrieve operation
      const zipStream = this.command.connection.metadata
        .retrieve({
          apiVersion: Number(Constants.DEFAULT_API_VERSION),
          singlePackage: false, // Set to false to get filtered profiles
          unpackaged: packageManifest.Package as any,
        })
        .stream();

      // Unzip and process the retrieved package
      let componentCount = 0;
      return await new Promise<string>((resolve) => {
        let pendingWrites = 0; // Counter for pending write streams
        let unzipFinished = false; // Flag to indicate if unzip has finished

        zipStream
          .pipe(unzipper.Parse())
          .on('entry', (entry: unzipper.Entry) => {
            const entryPath = entry.path.replace('unpackaged/', '');
            const filePath = path.join(tempOutputDir, entryPath);
            const directory = path.dirname(filePath);

            // Ensure directories exist before writing files
            fs.mkdirSync(directory, { recursive: true });

            // If it's a file, write it to the directory
            if (entry.type === 'File') {
              componentCount++;
              pendingWrites++; // Increment pending writes counter

              const writeStream = fs.createWriteStream(filePath);
              entry.pipe(writeStream);

              // Ensure the write stream is properly closed after writing
              writeStream.on('finish', () => {
                writeStream.close();
                pendingWrites--; // Decrement pending writes counter

                // If unzip is finished and no pending writes, resolve the promise
                if (unzipFinished && pendingWrites === 0) {
                  utils.spinnerwithComponentMessage(
                    'stop',
                    'success.retrieving-package',
                    packagePath,
                    componentCount.toString()
                  );
                  resolve(tempOutputDir);
                }
              });
            } else {
              entry.autodrain(); // Skip directories
            }
          })
          .on('error', (err: Error) => {
            utils.throwWithErrorMessage(err, 'error.retrieving-package', packagePath);
          })
          .on('close', () => {
            unzipFinished = true; // Set unzip finished flag
            // If no pending writes, resolve the promise
            if (pendingWrites === 0) {
              utils.spinnerwithComponentMessage(
                'stop',
                'success.retrieving-package',
                packagePath,
                componentCount.toString()
              );
              resolve(tempOutputDir);
            }
          });
      });
    } catch (err) {
      utils.throwWithErrorMessage(err as Error, 'error.retrieving-package', packagePath);
    }
  }

  /**
   * Merges two metadata XML files by comparing sections by their names and key values.
   * Updates the existing sections in the target XML file with the sections having the same key values in the source XML file.
   * Puts the new sections after the last occurrence of the similar section in the target XML file or at the end of the file if the section does not exist.
   * Preserves the order of the sections in the target XML file.
   * @param sourceFilePath The path to the source metadata XML file.
   * @param targetFilePath The path to the target metadata XML file.
   * @param outputFilePath The path to the output metadata XML file.
   * @param rootTag The root tag of the metadata XML file, for example, `Profile` for profile metadata.
   * @param sectionKeyMapping A mapping of section names to key names used to identify sections in the XML files.
   */
  public mergeMetadataXml(
    sourceFilePath: string,
    targetFilePath: string,
    outputFilePath: string,
    rootTag: string,
    sectionKeyMapping: Record<string, string>
  ): void {
    const logSourcefilePath = Utils.shortenFilePath(sourceFilePath, 60);
    const logTargetFilePath = Utils.shortenFilePath(targetFilePath, 60);
    const logOutputFilePath = Utils.shortenFilePath(outputFilePath, 60);
    const utils = new CommandUtils(this.command);
    try {
      // Log the progress of the metadata merge
      utils.spinnerwithComponentMessage('start', 'progress.merging-metadata-xml', logSourcefilePath, logTargetFilePath);

      // Read the XML files synchronously
      const sourceXml = fs.readFileSync(sourceFilePath, Constants.DEFAULT_ENCODING);
      const targetXml = fs.readFileSync(targetFilePath, Constants.DEFAULT_ENCODING);

      // Parse the XML into JS objects
      const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: true, commentPropName: '#comment' });
      const sourceData: any[] = parser.parse(sourceXml);
      const targetData: any[] = parser.parse(targetXml);

      const sourceSectionArray: any[] = sourceData.find((obj) => obj[rootTag])[rootTag];
      const targetSectionArray: any[] = targetData.find((obj) => obj[rootTag])[rootTag];

      if (!sourceSectionArray || !targetSectionArray) {
        utils.throwError('error.merging-metadata-xml.no-root-tag', rootTag);
      }

      let modified = false;

      // Remove duplicates from targetSectionArray
      if (this.command.flags.dedup) {
        const sectionKeyToSectionMap: Record<string, any> = {};
        const sectionKeyToIndexMap: Record<string, number> = {};
        const sectionsToRemoveIndices: Set<number> = new Set();

        for (let i = 0; i < targetSectionArray.length; i++) {
          const section = targetSectionArray[i];
          const sectionKeyObj = ApiUtils._extractSectionKey(section, sectionKeyMapping);
          const sectionKey = sectionKeyObj.key;
          const sectionName = sectionKeyObj.sectionName;

          if (sectionKey) {
            if (sectionKey in sectionKeyToSectionMap) {
              // Duplicate found
              const existingSection = sectionKeyToSectionMap[sectionKey];
              const existingIndex = sectionKeyToIndexMap[sectionKey];

              const existingPropsCount = Object.keys(existingSection[sectionName as string] || {}).length;
              const currentPropsCount = Object.keys(section[sectionName as string] || {}).length;

              if (currentPropsCount > existingPropsCount) {
                // Keep current section, remove existing one
                sectionsToRemoveIndices.add(existingIndex);
                // Update the map with current section and index
                sectionKeyToSectionMap[sectionKey] = section;
                sectionKeyToIndexMap[sectionKey] = i;
              } else {
                // Keep existing section, remove current one
                sectionsToRemoveIndices.add(i);
              }
            } else {
              // First occurrence
              sectionKeyToSectionMap[sectionKey] = section;
              sectionKeyToIndexMap[sectionKey] = i;
            }
          }
          // If section has no key, leave it as is
        }

        // Remove duplicates from targetSectionArray
        // Remove from higher indices to lower to avoid index shift
        const indicesToRemove = Array.from(sectionsToRemoveIndices).sort((a, b) => b - a);
        if (indicesToRemove.length > 0) {
          modified = true;
        }
        for (const index of indicesToRemove) {
          targetSectionArray.splice(index, 1);
        }
      }

      // Iterate over the source objects and either add or update them in the target
      const targetSectionMap: Record<string, any> = {};
      const lastSectionPoisitionMap: Record<string, number> = {};

      for (let sectionIndex = targetSectionArray.length - 1; sectionIndex >= 0; sectionIndex--) {
        const targetObject = targetSectionArray[sectionIndex];
        const sectionKey = ApiUtils._extractSectionKey(targetObject, sectionKeyMapping);
        if (sectionKey.key) {
          targetSectionMap[sectionKey.key] = targetObject;
        } else if (!sectionKey.isSectionExist) {
          utils.throwError('error.merging-metadata-xml.no-section', JSON.stringify(targetObject), logTargetFilePath);
        }
        lastSectionPoisitionMap[sectionKey.sectionName ?? ''] =
          lastSectionPoisitionMap[sectionKey.sectionName ?? ''] || sectionIndex;
      }

      sourceSectionArray.forEach((sourceObject) => {
        const sectionKey = ApiUtils._extractSectionKey(sourceObject, sectionKeyMapping);
        if (!sectionKey.isSectionExist) {
          utils.throwError('error.merging-metadata-xml.no-section', JSON.stringify(sourceObject), logSourcefilePath);
        }
        const targetObject = targetSectionMap[sectionKey.key];
        if (targetObject) {
          if (this.command.flags['merge-props']) {
            // Merge properties from sourceObject into targetObject
            const isEquals = ApiUtils._mergeMetadataProperties(
              targetObject[sectionKey.sectionName ?? ''],
              sourceObject[sectionKey.sectionName ?? '']
            );
            if (!isEquals) {
              modified = true;
            }
          } else {
            // Replace targetObject with sourceObject
            const isEquals = Utils.deepCompare(sourceObject, targetObject);
            if (!isEquals) {
              const targetObjectIndex = targetSectionArray.indexOf(targetObject);
              targetSectionArray.splice(targetObjectIndex, 1, sourceObject);
              modified = true;
            }
          }
        } else if (sectionKey.key) {
          const targetObjectIndex =
            lastSectionPoisitionMap[sectionKey.sectionName ?? ''] || targetSectionArray.length - 1;
          targetSectionArray.splice(targetObjectIndex + 1, 0, sourceObject);
          modified = true;
        }
      });

      // Convert the updated targetData back to XML
      if (outputFilePath !== targetFilePath || modified) {
        const builder = new XMLBuilder({
          ignoreAttributes: false,
          format: true,
          preserveOrder: true,
          commentPropName: '#comment',
        });

        let updatedXml: string = builder.build(targetData);

        // Post-process the XML to fix tags containing only comments
        const pattern = /(<(\w+)>)(\s*\n\s*)(<!--[\s\S]*?-->)(\s*\n\s*)(<\/\2>)/g;
        updatedXml = updatedXml.replace(pattern, '$1$4$6');

        // Additional code to replace empty tags with self-closing tags
        const emptyTagPattern = /<(\w+)>\s*<\/\1>/g;
        updatedXml = updatedXml.replace(emptyTagPattern, '<$1/>');

        // Write the merged XML to the output file synchronously
        fs.writeFileSync(outputFilePath, updatedXml);

        // Log the completion of the metadata merge
        utils.spinnerwithComponentMessage(
          'stop',
          'success.merging-metadata-xml',
          logSourcefilePath,
          logTargetFilePath,
          logOutputFilePath
        );
      } else {
        // Log that no changes were made during the metadata merge
        utils.spinnerwithComponentMessage(
          'stop',
          'success.merging-metadata-xml.no-changes',
          logSourcefilePath,
          logTargetFilePath
        );
      }
    } catch (err) {
      // Log and handle any errors that occur during the metadata merge
      utils.throwWithErrorMessage(err as Error, 'error.merging-metadata-xml', logSourcefilePath, logTargetFilePath);
    }
  }

  /**
   * Lists files in the metadata folder by the given metadata type name.
   * @param metadataTypeName The metadata type name.
   * @param metadataRootFolder The root folder of the metadata, can be a relative or absolute path.
   * @returns List of paths to the metadata files.
   */
  public listMetadataFiles(metadataTypeName: string, metadataRootFolder?: string): string[] {
    const filePath = this.getMetadataRootFolder(metadataTypeName, metadataRootFolder);
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(filePath, { recursive: true });
      return [];
    }
    const files = fs.readdirSync(filePath);
    return files.map((file) => path.join(filePath, file));
  }

  /**
   * Gets the root folder of the metadata for the force-app project.
   * @param metadataTypeName The metadata type name.
   * @param metadataRootFolder The root folder of the metadata, can be a relative or absolute path.
   * @returns The path to the root folder of the metadata.
   */
  public getMetadataRootFolder(metadataTypeName: string, metadataRootFolder?: string): string {
    if (metadataRootFolder) {
      return path.join(
        metadataRootFolder,
        Constants.PACKAGE_XML_METADATA_NAME_TO_SFDX_PROJECT_FOLDER_MAPPING[metadataTypeName]
      );
    }
    const sfdxMainDefaultPath = ApiUtils.getForceAppProjectMainDefaultPath();
    let rootFolder = (this.command.flags['source-dir'] as string) || sfdxMainDefaultPath;
    rootFolder = path.join(rootFolder, Constants.FORCE_APP_MAIN_DEFAULT_PATH);
    return path.join(
      process.cwd(),
      rootFolder,
      Constants.PACKAGE_XML_METADATA_NAME_TO_SFDX_PROJECT_FOLDER_MAPPING[metadataTypeName]
    );
  }

  /**
   * Retrieves metadata for an sObject from the target or source org.
   * @param sobjectName The name of the sObject to retrieve metadata for.
   * @param useSourceConnection A flag indicating whether to use the source connection.
   * @returns The object metadata.
   */
  public async getSObjectMetadataAsync(
    sobjectName: string,
    useSourceConnection?: boolean
  ): Promise<SObjectDescribe | undefined> {
    const utils = new CommandUtils(this.command);
    const label = useSourceConnection ? this.command.sourceConnectionLabel : this.command.targetConnectionLabel;
    try {
      // Determine which connection to use based on the flag
      const connection = useSourceConnection ? this.command.sourceConnection : this.command.connection;
      // Log the start of the sObject metadata retrieval
      utils.logComponentMessage('progress.retrieving-sobject-metadata', sobjectName, label);
      // Retrieve the sObject description from the connection
      const sobjectDescribe = (await connection.describe(sobjectName)) as DescribeSObjectResult;
      // Log the successful retrieval of the sObject metadata
      utils.logComponentMessage('success.retrieving-sobject-metadata', sobjectName, label);
      return new SObjectDescribe(sobjectDescribe);
    } catch (err) {
      // Handle any errors that occur during the sObject metadata retrieval
      utils.throwWithErrorMessage(err as Error, 'error.retrieving-sobject-metadata', sobjectName, label);
    }
  }

  /**
   * Asynchronously runs a bulk query against a database or an API and writes the results to a CSV file.
   * Uses streaming so can handle large datasets without running out of memory.
   * Support optional record stream realtime transformation and progress reporting.
   * Uses Salesforce bulk query API to query records.
   *
   * @param query - The query string to execute.
   * @param filePath - The file path where the query result will be saved.
   * @param appendToExistingFile - Whether to append to an existing file (if true) or overwrite it (if false).
   * @param useSourceConnection - Whether to use the source connection (if true) or the target connection (if false).
   * @param recordCallback - Optional callback function to process each record before it's written.
   * @param progressCallback - Optional callback function to report progress.
   * @returns A promise that resolves with the number of records processed or `undefined` if an error occurs.
   */
  public async queryBulkToFileAsync(params: QueryAsyncParameters): Promise<number | undefined> {
    // Utility for logging messages and handling errors
    const utils = new CommandUtils(this.command);

    // Determine which connection label to use for logging
    const label = params.useSourceConnection ? this.command.sourceConnectionLabel : this.command.targetConnectionLabel;

    // Select the appropriate connection (source or target) based on the flag
    const connection: Connection = params.useSourceConnection ? this.command.sourceConnection : this.command.connection;

    let timeout: NodeJS.Timeout | undefined;

    try {
      // Log a message indicating the start of the query process
      utils.logComponentMessage('progress.querying-records', Constants.SFORCE_API_ENGINES.BULK, label, params.query);

      // Resolve the file path to an absolute path if it is not already
      const resolvedFilePath = path.isAbsolute(params.filePath!)
        ? params.filePath
        : path.resolve(process.cwd(), params.filePath!);

      // Check if the file already exists and decide whether to write headers
      const fileExists = fs.existsSync(resolvedFilePath!);
      const writeHeaders = !params.appendToExistingFile || !fileExists;

      // Create a write stream to write the query results to the file
      const csvTargetFileWriteStream = fs.createWriteStream(resolvedFilePath!, {
        flags: writeHeaders ? 'w' : 'a',
        highWaterMark: Constants.DEFAULT_FILE_WRITE_STREAM_HIGH_WATER_MARK,
        encoding: Constants.DEFAULT_ENCODING,
      });

      // Track the number of records processed
      let recordCount = 0;
      let filteredRecordCount = 0;
      let lastRecordsCountReported = -1;

      // Function to report progress at regular intervals
      const reportProgress = (): void => {
        if (params.progressCallback && recordCount !== lastRecordsCountReported) {
          params.progressCallback({
            recordCount,
            filteredRecordCount,
            engine: Constants.SFORCE_API_ENGINES.BULK,
          });
          lastRecordsCountReported = recordCount;
        }
      };

      if (params.progressCallback) {
        // Set a timeout to report progress at regular intervals
        timeout = setInterval(() => reportProgress(), Constants.API_JOB_INTERNAL_POLLING_INTERVAL);
        // Immediately report the initial progress
        reportProgress();
      }

      const pollingSettings = ApiUtils.suggestPollingSettings();
      connection.bulk.pollTimeout = pollingSettings.pollTimeout;

      const recordStream = await connection.bulk.query(params.query);
      const queryStream = recordStream.stream();
      queryStream.setEncoding(Constants.DEFAULT_ENCODING);

      let headers: Map<number, string> = new Map();
      let columns = true; // Flag to indicate if the first row contains column headers

      // Function to convert an array of values to an object with column headers as keys
      const arrayToObject = (arr: any[]): any =>
        arr.reduce((acc, val, index) => {
          acc[headers.get(index) as string] = val;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return acc;
        }, {});

      // Function to convert an object to an array of values using column headers
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      const objectToArray = (obj: any): any[] => Array.from(headers.values()).map((prop) => obj[prop]);

      // Define the processing and writing logic as a constant function
      const processAndWriteRecords = async (records: any[], header = true): Promise<void> => {
        // Process each record
        const processedRecords = [];

        for (const record of records) {
          recordCount++;
          if (params.recordCallback) {
            // Process the record using the callback function
            const recordObj = !columns ? arrayToObject(record) : record;
            const processedRecord = params.recordCallback(recordObj);
            if (processedRecord) {
              filteredRecordCount++;
              const processedRecordOrArray = !columns ? objectToArray(processedRecord) : processedRecord;
              processedRecords.push(processedRecordOrArray);
            }
          } else {
            processedRecords.push(record);
            filteredRecordCount++;
          }
        }

        if (processedRecords.length > 0) {
          // Convert processed records back to CSV strings
          const csvData = stringify(processedRecords, {
            ...Constants.CSV_STRINGIFY_OPTIONS,
            header,
            bom: header,
          });

          for await (const chunk of csvData) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            if (!csvTargetFileWriteStream.write(chunk)) {
              // Wait for the write stream to drain before continuing
              await Promise.race([once(csvTargetFileWriteStream, 'drain'), writeStreamError]);
            }
          }
        }
      };

      // Promises to handle 'error' events
      const writeStreamError = once(csvTargetFileWriteStream, 'error').then(([err]) => {
        queryStream.destroy();
        throw err;
      });

      let completed = false;
      void once(queryStream, 'error').then(([err]) => {
        if (!completed) {
          throw err;
        }
      });

      // Process the data stream

      let lastIncompleteLine = '';
      let columnsCount = 0;

      for await (const chunk of queryStream) {
        if (typeof chunk == 'string' && chunk.includes('Records not found')) {
          csvTargetFileWriteStream.write(params.columns?.join(',') + os.EOL);
          break;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        let dataBuffer: string = chunk.toString(Constants.DEFAULT_ENCODING);
        if (lastIncompleteLine) {
          dataBuffer = lastIncompleteLine + dataBuffer;
          lastIncompleteLine = '';
        }

        const lines = dataBuffer.split(/[\n\r]+/g);

        if (columns) {
          columnsCount = lines[0].split(Constants.CSV_PARSE_OPTIONS.delimiter).length;
        }

        const lastLine = lines[lines.length - 1];

        if (
          (!lastLine.endsWith(Constants.BULK_API_QUERY_CSV_LINE_SEPARATOR) &&
            !lastLine.endsWith(Constants.CSV_PARSE_OPTIONS.quote)) ||
          lastLine.endsWith(`${Constants.BULK_API_QUERY_CSV_LINE_SEPARATOR}${Constants.CSV_PARSE_OPTIONS.quote}`) ||
          lastLine.endsWith(`,${Constants.CSV_PARSE_OPTIONS.quote}`) ||
          lastLine.split(Constants.CSV_PARSE_OPTIONS.delimiter).length < columnsCount
        ) {
          lastIncompleteLine = lines.pop() as string;
          dataBuffer = lines.join(os.EOL);
        }

        const options = {
          ...Constants.CSV_PARSE_OPTIONS,
          columns,
          encoding: Constants.DEFAULT_ENCODING, // Specify the encoding of the CSV file
        };

        const records = parse(dataBuffer, options as any);
        if (columns) {
          headers = Object.keys(records[0]).reduce((acc, key, index) => {
            acc.set(index, key);
            return acc;
          }, new Map<number, string>());
        }

        await processAndWriteRecords(records, columns && writeHeaders);

        columns = false;
      }

      completed = true;

      // End the write stream after processing
      csvTargetFileWriteStream.end();

      // Wait for 'finish' event or handle errors
      await Promise.race([once(csvTargetFileWriteStream, 'finish'), writeStreamError]);

      // Destroy the query stream to prevent memory leaks
      queryStream.destroy();

      // Final progress report
      reportProgress();

      utils.logComponentMessage(
        'success.querying-records',
        Constants.SFORCE_API_ENGINES.BULK,
        label,
        recordCount.toString()
      );

      return recordCount;
    } catch (err) {
      // Handle any errors that occur during the query or file writing process
      utils.throwWithErrorMessage(err as Error, 'error.querying-records', label);
    } finally {
      // Clear the progress reporting timeout if it was set
      if (timeout) {
        clearInterval(timeout);
      }
    }
  }

  /**
   * Asynchronously runs a REST query against a database or an API and writes the results to a CSV file.
   * Suitable for small datasets.
   * Does not use streaming so may run out of memory for large datasets.
   * Supports progress reporting and optional record transformation.
   * @param params  The parameters for the query operation.
   * @returns  A promise that resolves with the number of records processed or `undefined` if an error occurs.
   */
  public async queryRestToFileAsync(params: QueryAsyncParameters): Promise<number | undefined> {
    // Utility for logging messages and handling errors
    const utils = new CommandUtils(this.command);

    // Determine which connection label to use for logging
    const label = params.useSourceConnection ? this.command.sourceConnectionLabel : this.command.targetConnectionLabel;

    // Select the appropriate connection (source or target) based on the flag
    const connection: Connection = params.useSourceConnection ? this.command.sourceConnection : this.command.connection;

    let timeout: NodeJS.Timeout | undefined;

    try {
      // Log a message indicating the start of the query process
      utils.logComponentMessage('progress.querying-records', Constants.SFORCE_API_ENGINES.REST, label, params.query);

      // Resolve the file path to an absolute path if it is not already
      const resolvedFilePath = path.isAbsolute(params.filePath!)
        ? params.filePath
        : path.resolve(process.cwd(), params.filePath!);

      // Check if the file already exists and decide whether to write headers
      const fileExists = fs.existsSync(resolvedFilePath!);
      const writeHeaders = !params.appendToExistingFile || !fileExists;

      // Create a write stream to write the query results to the file
      const csvTargetFileWriteStream = fs.createWriteStream(resolvedFilePath!, {
        flags: writeHeaders ? 'w' : 'a',
        highWaterMark: Constants.DEFAULT_FILE_WRITE_STREAM_HIGH_WATER_MARK,
        encoding: Constants.DEFAULT_ENCODING,
      });

      // Track the number of records processed
      let recordCount = 0;
      let filteredRecordCount = 0;
      let lastRecordsCountReported = -1;

      const reportProgress = (): void => {
        if (params.progressCallback && recordCount !== lastRecordsCountReported) {
          params.progressCallback({
            recordCount,
            filteredRecordCount,
            engine: Constants.SFORCE_API_ENGINES.REST,
          });
          lastRecordsCountReported = recordCount;
        }
      };

      if (params.progressCallback) {
        // Set a timeout to report progress every specified interval
        timeout = setInterval(() => reportProgress(), Constants.API_JOB_INTERNAL_POLLING_INTERVAL);
        // Immediately report the initial progress
        reportProgress();
      }

      // Perform the query using the REST API with event handlers
      const data = (
        await new Promise<any[]>((resolve, reject) => {
          const records: any[] = [];
          const queryOptions = {
            autoFetch: true,
            maxFetch: Constants.MAX_FETCH_LIMIT,
            headers: Constants.SFORCE_API_CALL_HEADERS,
          };
          void connection
            .query(params.query)
            .on('record', (record) => {
              recordCount++;
              if (params.recordCallback) {
                const processedRecord = params.recordCallback(record);
                if (processedRecord) {
                  filteredRecordCount++;
                  records.push(processedRecord);
                }
              } else {
                filteredRecordCount++;
                records.push(record);
              }
            })
            .on('end', () => {
              resolve(records);
            })
            .on('error', (err) => {
              reject(err);
            })
            .run(queryOptions);
        })
      )
        .filter((record) => !!record)
        .map((record: any): any => {
          delete record.attributes;
          return ApiUtils.expandSObjectRecord(record);
        });

      const csvString = await new Promise<string>((resolve, reject) => {
        stringify(
          data,
          {
            ...Constants.CSV_STRINGIFY_OPTIONS,
            header: writeHeaders,
            bom: writeHeaders,
          },
          (err, output) => {
            if (err) {
              reject(err);
            } else {
              resolve(output); // Возвращаем CSV-строку
            }
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        // Write the data into the stream
        csvTargetFileWriteStream.write(csvString, (err) => {
          if (err) {
            return reject(err);
          }
          csvTargetFileWriteStream.end(() => {
            resolve();
          });
        });
      });

      // Final progress report
      reportProgress();

      // Log a success message indicating the number of records processed
      utils.logComponentMessage(
        'success.querying-records',
        Constants.SFORCE_API_ENGINES.REST,
        label,
        recordCount.toString()
      );

      return recordCount;
    } catch (err) {
      // Handle any errors that occur during the query or file writing process
      utils.throwWithErrorMessage(err as Error, 'error.querying-records', label);
    } finally {
      // Clear the progress reporting timeout if it was set
      if (timeout) {
        clearInterval(timeout);
      }
    }
  }

  /**
   * Asynchronously runs a REST query against a database or an API and returns the results as an array.
   * Suitable for small datasets.
   * Supports progress reporting and optional record transformation.
   * @param params  The parameters for the query operation.
   * @returns  A promise that resolves with the number of records processed or `undefined` if an error occurs.
   */
  public async queryRestToMemoryAsync(params: QueryAsyncParameters): Promise<any[] | undefined> {
    // Utility for logging messages and handling errors
    const utils = new CommandUtils(this.command);

    // Determine which connection label to use for logging
    const label = params.useSourceConnection ? this.command.sourceConnectionLabel : this.command.targetConnectionLabel;

    // Select the appropriate connection (source or target) based on the flag
    const connection: Connection = params.useSourceConnection ? this.command.sourceConnection : this.command.connection;

    let timeout: NodeJS.Timeout | undefined;

    try {
      // Log a message indicating the start of the query process
      utils.logComponentMessage('progress.querying-records', Constants.SFORCE_API_ENGINES.REST, label, params.query);

      // Track the number of records processed
      let recordCount = 0;
      let filteredRecordCount = 0;
      let lastRecordsCountReported = -1;

      const reportProgress = (): void => {
        if (params.progressCallback && recordCount !== lastRecordsCountReported) {
          params.progressCallback({
            recordCount,
            filteredRecordCount,
            engine: Constants.SFORCE_API_ENGINES.REST,
          });
          lastRecordsCountReported = recordCount;
        }
      };

      if (params.progressCallback) {
        // Set a timeout to report progress every specified interval
        timeout = setInterval(() => reportProgress(), Constants.API_JOB_INTERNAL_POLLING_INTERVAL);
        // Immediately report the initial progress
        reportProgress();
      }

      // Perform the query using the REST API with event handlers
      const data = (
        await new Promise<any[]>((resolve, reject) => {
          const records: any[] = [];
          const queryOptions = {
            autoFetch: true,
            maxFetch: Constants.MAX_FETCH_LIMIT,
            headers: Constants.SFORCE_API_CALL_HEADERS,
          };
          void connection
            .query(params.query)
            .on('record', (record) => {
              recordCount++;
              if (params.recordCallback) {
                const processedRecord = params.recordCallback(record);
                if (processedRecord) {
                  filteredRecordCount++;
                  records.push(processedRecord);
                }
              } else {
                filteredRecordCount++;
                records.push(record);
              }
            })
            .on('end', () => {
              resolve(records);
            })
            .on('error', (err) => {
              reject(err);
            })
            .run(queryOptions);
        })
      )
        .filter((record) => !!record)
        .map((record: any): any => {
          delete record.attributes;
          return ApiUtils.expandSObjectRecord(record);
        });

      // Final progress report
      reportProgress();

      // Log a success message indicating the number of records processed
      utils.logComponentMessage(
        'success.querying-records',
        Constants.SFORCE_API_ENGINES.REST,
        label,
        recordCount.toString()
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return data;
    } catch (err) {
      // Handle any errors that occur during the query or file writing process
      utils.throwWithErrorMessage(err as Error, 'error.querying-records', label);
    } finally {
      // Clear the progress reporting timeout if it was set
      if (timeout) {
        clearInterval(timeout);
      }
    }
  }

  /**
   *  Asynchronously runs a REST query against a database or an API and  returns the results as an array.
   *  Good for fast data retrieval.
   *  Uses the simple query method to retrieve data.
   * Supports records transformation and initial and final progress reporting.
   * @param params
   * @returns
   */
  public async queryRestToMemorySimpleAsync(params: QueryAsyncParameters): Promise<any[] | undefined> {
    // Utility for logging messages and handling errors
    const utils = new CommandUtils(this.command);

    // Determine which connection label to use for logging
    const label = params.useSourceConnection ? this.command.sourceConnectionLabel : this.command.targetConnectionLabel;

    // Select the appropriate connection (source or target) based on the flag
    const connection: Connection = params.useSourceConnection ? this.command.sourceConnection : this.command.connection;

    await connection.sobject('Account').update([], {
      allOrNone: true,
      allowRecursive: true,
      headers: Constants.SFORCE_API_CALL_HEADERS,
    });

    try {
      // Log a message indicating the start of the query process
      utils.logComponentMessage('progress.querying-records', Constants.SFORCE_API_ENGINES.REST, label, params.query);

      // Track the number of records processed
      let recordCount = 0;
      let filteredRecordCount = 0;

      const reportProgress = (): void => {
        if (params.progressCallback) {
          params.progressCallback({
            recordCount,
            filteredRecordCount,
            engine: Constants.SFORCE_API_ENGINES.REST,
          });
        }
      };

      const queryOptions = {
        autoFetch: true,
        maxFetch: Constants.MAX_FETCH_LIMIT,
        headers: Constants.SFORCE_API_CALL_HEADERS,
      };

      // Report initial progress
      reportProgress();

      const res = await connection.query(params.query, queryOptions);
      const data = res.records
        .map((record: any): any => {
          recordCount++;
          delete record.attributes;
          record = ApiUtils.expandSObjectRecord(record);
          if (params.recordCallback) {
            filteredRecordCount++;
            return params.recordCallback(record);
          } else {
            filteredRecordCount++;
            return record;
          }
        })
        .filter((record: any) => !!record);

      // Final progress report
      reportProgress();

      // Log a success message indicating the number of records processed
      utils.logComponentMessage(
        'success.querying-records',
        Constants.SFORCE_API_ENGINES.REST,
        label,
        data.length.toString()
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return data;
    } catch (err) {
      // Handle any errors that occur during the query or file writing process
      utils.throwWithErrorMessage(err as Error, 'error.querying-records', label);
    }
  }

  /**
   * Asynchronously runs a bulk update operation from a CSV file.
   * Uses bulk API to update records.
   * Supports large datasets and progress reporting.
   * @param params  The parameters for the update operation.
   * @returns  A promise that resolves with the number of records processed or `undefined` if an error occurs.
   */
  public async updateBulkFromFileAsync(params: UpdateAsyncParameters): Promise<IngestJobInfo | undefined> {
    // Utility for logging messages and handling errors
    const utils = new CommandUtils(this.command);

    // Determine which connection label to use for logging
    const label = params.useSourceConnection ? this.command.sourceConnectionLabel : this.command.targetConnectionLabel;

    // Select the appropriate connection (source or target) based on the flag
    const connection: Connection = params.useSourceConnection ? this.command.sourceConnection : this.command.connection;

    // Set the default report level to 'Errors'
    params.reportLevel = params.reportLevel || OperationReportLevel.Errors;

    // Calculate the polling settings for the bulk2 API
    const pollingSettings = ApiUtils.suggestPollingSettings(params.projectedCsvRecordsCount);

    // Dynamically set the polling settings for the bulk2 API
    connection.bulk2.pollTimeout = pollingSettings.pollTimeout;

    // Set the polling interval for the bulk2 API
    let pollingIntervalTimeout: NodeJS.Timeout | undefined;

    const resolvedStatusFilePath =
      params.statusFilePath && params.reportLevel !== OperationReportLevel.None
        ? path.isAbsolute(params.statusFilePath)
          ? params.statusFilePath
          : path.resolve(process.cwd(), params.statusFilePath)
        : undefined;

    const csvStatusFileWriteStream = resolvedStatusFilePath
      ? Utils.createCsvWritableFileStream(
          resolvedStatusFilePath,
          Object.keys({
            sf__Id: 'sf__Id',
            sf__Created: 'false',
            sf__Error: 'sf__Error',
            Status: 'Success',
          } as IngestJobResult)
        )
      : undefined;

    try {
      // eslint-disable-next-line prefer-const
      let job: IngestJob;

      // Log a message indicating the start of the query process
      utils.logComponentMessage(
        'progress.updating-records-from-file',
        params.sobjectType,
        Constants.SFORCE_API_ENGINES.BULK2,
        label,
        Utils.capitalizeFirstLetter(params.operation),
        Utils.shortenFilePath(params.filePath!)
      );

      // Track the number of records processed
      let lastJobInfo: IngestJobInfo = {
        numberRecordsProcessed: 0,
        numberRecordsFailed: 0,
        recordCount: -1,
        state: 'Initializing',
        jobId: '',
        engine: Constants.SFORCE_API_ENGINES.BULK2,
        operation: params.operation,
      };

      // Function to report progress
      const reportProgress = (jobInfo?: Partial<IngestJobInfo>): void => {
        jobInfo = {
          ...lastJobInfo,
          ...jobInfo,
          ...{
            jobId: job?.id,
          },
        };
        const recordCount = jobInfo.numberRecordsProcessed! + jobInfo.numberRecordsFailed!;
        if (
          params.progressCallback &&
          (recordCount > lastJobInfo.recordCount! || jobInfo.state !== lastJobInfo.state)
        ) {
          lastJobInfo = { ...(jobInfo as IngestJobInfo), recordCount };
          lastJobInfo.recordCount = recordCount;
          params.progressCallback(lastJobInfo);
        }
      };

      // Initial progress report
      reportProgress();

      // Resolve the file path to an absolute path if it is not already
      const resolvedFilePath = path.isAbsolute(params.filePath!)
        ? params.filePath
        : path.resolve(process.cwd(), params.filePath!);

      // Check if the file already exists and decide whether to write headers
      const fileExists = fs.existsSync(resolvedFilePath!);
      if (!fileExists) {
        utils.throwError('error.file-not-found', Utils.shortenFilePath(resolvedFilePath!));
      }

      // Create a read stream to read the CSV file
      const csvSourceFileReadStream = Utils.createCsvReadableFileStream(resolvedFilePath!);

      // eslint-disable-next-line prefer-const
      job = connection.bulk2.createJob({
        operation: params.operation,
        object: params.sobjectType,
        lineEnding: os.EOL === '\n' ? 'LF' : 'CRLF',
      });

      // Open the job
      await job.open();

      // Upload the data to the job
      reportProgress({
        state: 'Uploading',
      });

      await job.uploadData(csvSourceFileReadStream);

      // Close the job
      await job.close();

      reportProgress({
        state: 'InProgress',
      });

      // Poll the job status until it is completed
      await new Promise<void>((resolve) => {
        pollingIntervalTimeout = setInterval(() => {
          void (async (): Promise<void> => {
            const state = await job.check();
            reportProgress(state);
            if (state.state === 'JobComplete' || state.state === 'Failed' || state.state === 'Aborted') {
              resolve();
              clearInterval(pollingIntervalTimeout);
              pollingIntervalTimeout = undefined;
            }
          })();
        }, pollingSettings.pollInterval);
      });

      // Report the successful completion of the job in csv file
      if (csvStatusFileWriteStream) {
        reportProgress({
          state: 'CreatingReports',
        });

        if (
          (params.operation === 'insert' && params.reportLevel === OperationReportLevel.Inserts) ||
          (params.operation !== 'insert' && params.reportLevel !== OperationReportLevel.Errors) ||
          params.reportLevel === OperationReportLevel.All
        ) {
          const successfulResults = await job.getSuccessfulResults();
          for (const result of successfulResults) {
            csvStatusFileWriteStream.writeObjects({
              sf__Id: result.sf__Id,
              sf__Created: result.sf__Created,
              sf__Error: '',
              Status: 'Success',
            } as IngestJobResult);
          }
        }

        // For failed results, we need to get the failed results for both insert and update operations
        const failedResults = await job.getFailedResults();
        // Write failed statuses
        for (const result of failedResults) {
          csvStatusFileWriteStream.writeObjects({
            sf__Id: result.sf__Id,
            sf__Created: 'false',
            sf__Error: result.sf__Error,
            Status: 'Error',
          } as IngestJobResult);
        }
        // Close the write stream
        csvStatusFileWriteStream.end();
      }

      // Final progress report
      reportProgress();

      return lastJobInfo;
    } catch (err) {
      // Write empty status file to status csv file
      if (csvStatusFileWriteStream) {
        csvStatusFileWriteStream.end();
      }
      // Handle any errors that occur during the query or file writing process
      utils.throwWithErrorMessage(err as Error, 'error.updating-records', params.sobjectType, label);
    } finally {
      // Clear the progress reporting timeout if it was set
      if (pollingIntervalTimeout) {
        clearInterval(pollingIntervalTimeout);
      }
    }
  }

  /**
   * Asynchronously runs an update operation using the REST API.
   * Uses sObject Collection API to update records.
   * Uses `records` array to update records.
   * Supports only small datasets and progress reporting.
   * @param params  The parameters for the update operation.
   * @returns  A promise that resolves with the job information or `undefined` if an error occurs.
   */
  // eslint-disable-next-line complexity
  public async updateRestFromArrayAsync(params: UpdateAsyncParameters): Promise<IngestJobInfo | undefined> {
    // Utility for logging messages and handling errors
    const utils = new CommandUtils(this.command);

    // Determine which connection label to use for logging
    const label = params.useSourceConnection ? this.command.sourceConnectionLabel : this.command.targetConnectionLabel;

    // Select the appropriate connection (source or target) based on the flag
    const connection: Connection = params.useSourceConnection ? this.command.sourceConnection : this.command.connection;

    // Extract parameters
    const sobjectType = params.sobjectType;
    const operation = params.operation;
    const records = params.records;

    // Set the default report level to 'None'
    params.reportLevel = params.reportLevel || OperationReportLevel.Errors;

    // Resolve the status file path if provided
    const resolvedStatusFilePath =
      params.statusFilePath && params.reportLevel !== OperationReportLevel.None
        ? path.isAbsolute(params.statusFilePath)
          ? params.statusFilePath
          : path.resolve(process.cwd(), params.statusFilePath)
        : undefined;

    // Create a CSV write stream if a status file path is provided
    const csvStatusFileWriteStream = resolvedStatusFilePath
      ? Utils.createCsvWritableFileStream(resolvedStatusFilePath, ['sf__Id', 'sf__Created', 'sf__Error', 'Status'])
      : undefined;

    // Validate that records are provided
    if (!records || records.length === 0) {
      utils.throwError('error.no-records-provided');
    }

    try {
      // Log a message indicating the start of the update process
      utils.logComponentMessage(
        'progress.updating-records-from-array',
        sobjectType,
        Constants.SFORCE_API_ENGINES.REST,
        label,
        Utils.capitalizeFirstLetter(operation)
      );

      // Create initial job information
      const jobInfo: IngestJobInfo = {
        numberRecordsProcessed: 0,
        numberRecordsFailed: 0,
        recordCount: records?.length,
        state: 'InProgress',
        engine: Constants.SFORCE_API_ENGINES.REST,
        operation: params.operation,
      };

      // Report progress at the start
      if (params.progressCallback) {
        params.progressCallback(jobInfo);
      }

      let result;

      // Perform the operation using the appropriate method
      switch (operation) {
        case 'insert':
          result = await connection.sobject(sobjectType).create(records!, { allowRecursive: true });
          break;
        case 'update':
          result = await connection.sobject(sobjectType).update(records!, { allowRecursive: true });
          break;
        case 'delete':
          result = await connection.sobject(sobjectType).delete(
            records!.map((record) => record['Id'] as string),
            { allowRecursive: true }
          );
          break;
        default:
          utils.throwError('error.invalid-operation', operation);
      }

      // Initialize counters
      let numberRecordsProcessed = 0;
      let numberRecordsFailed = 0;

      // Process the results
      if (Array.isArray(result)) {
        for (const res of result) {
          if (res.success) {
            numberRecordsProcessed++;
            // Write successful records if required
            if (
              csvStatusFileWriteStream &&
              ((operation === 'insert' && params.reportLevel === OperationReportLevel.Inserts) ||
                (operation !== 'insert' && params.reportLevel !== OperationReportLevel.Errors) ||
                params.reportLevel === OperationReportLevel.All)
            ) {
              csvStatusFileWriteStream.writeObjects({
                sf__Id: res.id,
                sf__Created: operation === 'insert' ? 'true' : 'false',
                sf__Error: '',
                Status: 'Success',
              } as IngestJobResult);
            }
          } else {
            numberRecordsFailed++;
            // Write failed records if required
            if (
              csvStatusFileWriteStream &&
              ((operation === 'insert' && params.reportLevel !== OperationReportLevel.Inserts) ||
                (operation !== 'insert' && params.reportLevel !== OperationReportLevel.Inserts))
            ) {
              const errorMessage = res.errors && res.errors.length > 0 ? res.errors.join('; ') : '';
              csvStatusFileWriteStream.writeObjects({
                sf__Id: res.id || '',
                sf__Created: 'false',
                sf__Error: errorMessage,
                Status: 'Error',
              } as IngestJobResult);
            }
          }
        }
      }

      // Update job information
      jobInfo.numberRecordsProcessed = numberRecordsProcessed;
      jobInfo.numberRecordsFailed = numberRecordsFailed;
      jobInfo.state = 'JobComplete';

      // Report progress at the end
      if (params.progressCallback) {
        params.progressCallback(jobInfo);
      }

      // Close the CSV write stream if it exists
      if (csvStatusFileWriteStream) {
        csvStatusFileWriteStream.end();
      }

      return jobInfo;
    } catch (err) {
      // Close the CSV write stream if it exists
      if (csvStatusFileWriteStream) {
        csvStatusFileWriteStream.end();
      }
      // Handle any errors that occur during the operation
      if (!params.isInnerMetod) {
        utils.throwWithErrorMessage(err as Error, 'error.updating-records', sobjectType, label);
      } else {
        throw err;
      }
    }
  }

  /**
   * Asynchronously runs an update operation using the REST API.
   * Uses sObject Collection API to update records from a CSV file.
   * Supports only small datasets and progress reporting.
   * @param params  The parameters for the update operation.
   * @returns  A promise that resolves with the job information or `undefined` if an error occurs.
   */
  // eslint-disable-next-line complexity
  public async updateRestFromFileAsync(params: UpdateAsyncParameters): Promise<IngestJobInfo | undefined> {
    // Utility for logging messages and handling errors
    const utils = new CommandUtils(this.command);

    // Determine which connection label to use for logging
    const label = params.useSourceConnection ? this.command.sourceConnectionLabel : this.command.targetConnectionLabel;

    // Extract parameters
    const { filePath, sobjectType, operation } = params;

    // Resolve the file path to an absolute path if it is not already
    const resolvedFilePath = path.isAbsolute(filePath!) ? filePath : path.resolve(process.cwd(), filePath!);

    // Check if the file exists
    if (!fs.existsSync(resolvedFilePath!)) {
      utils.throwError('error.file-not-found', Utils.shortenFilePath(resolvedFilePath!));
    }

    try {
      // Log a message indicating the start of the update process
      utils.logComponentMessage(
        'progress.updating-records-from-file',
        sobjectType,
        Constants.SFORCE_API_ENGINES.REST,
        label,
        Utils.capitalizeFirstLetter(operation),
        Utils.shortenFilePath(resolvedFilePath!)
      );

      // Create a read stream to read the CSV file
      const csvSourceFileReadStream = Utils.createCsvReadableFileStream(resolvedFilePath!).pipe(
        csvParser({
          ...Constants.CSV_PARSE_OPTIONS,
        })
      );

      // Array to hold the records
      const records: any[] = [];

      // Read and parse the CSV file
      for await (const row of csvSourceFileReadStream) {
        if (Object.keys(row).length > 0) {
          records.push(row);
        }
      }

      csvSourceFileReadStream.end();

      // Call the updateRestFromArrayAsync method with the records
      const jobInfo = await this.updateRestFromArrayAsync({
        ...params,
        records,
        isInnerMetod: true,
      });

      return jobInfo;
    } catch (err) {
      // Handle any errors that occur during the operation
      utils.throwWithErrorMessage(err as Error, 'error.updating-records', sobjectType, label);
    }
  }
}
