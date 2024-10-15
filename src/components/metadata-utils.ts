/* eslint-disable @typescript-eslint/no-unused-vars */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { once } from 'node:events';
import * as os from 'node:os';

import { stringify } from 'csv-stringify';
import { parse } from 'csv-parse/sync';

import { Connection } from '@salesforce/core';
import * as unzipper from 'unzipper';

import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { Constants } from './constants.js';
import { SFtaskerCommand, SObjectDescribe } from './models.js';
import { CommandUtils } from './command-utils.js';
import { Utils } from './utils.js';
import { DescribeSObjectResult, PackageXmlContent, PackageXmlType, QueryAsyncParameters } from './types.js';

/**
 * Represents a key section in XML metadata.
 *
 * @property key - The combined key identifier.
 * @property isSectionExist - Indicates if the section exists.
 * @property sectionName - The name of the section.
 * @property keyName - The name of the key.
 * @property keyValue - The value of the key.
 */
type XmlSectionKey = {
  key: string;
  isSectionExist: boolean;
  sectionName?: string;
  keyName?: string;
  keyValue?: string;
};

/**
 * Utility class for metadata-related operations.
 */
export class MetadataUtils<T> {
  /** Default path for force-app project main folder. */
  private static _forceAppProjectMainDefaultPath: string;

  /**
   * Creates a new instance of the MetadataUtils class.
   * @param command The command object used to retrieve metadata.
   * @param outputDir The output directory for the retrieved metadata.
   */
  public constructor(private command: SFtaskerCommand<T>, private outputDir: string) {}

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
    if (MetadataUtils._forceAppProjectMainDefaultPath) {
      return MetadataUtils._forceAppProjectMainDefaultPath;
    }
    // Check if the project is a force-app project
    if (MetadataUtils.isForceAppProject()) {
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
        MetadataUtils._forceAppProjectMainDefaultPath = forceAppProjectMainDefaultPath.path;
        return MetadataUtils._forceAppProjectMainDefaultPath;
      }
    }
    // Set the default path to the force-app project main folder
    MetadataUtils._forceAppProjectMainDefaultPath = Constants.FORCE_APP_PROJECT_ROOT_MAIN_DEFAULT_PATH;
    return MetadataUtils._forceAppProjectMainDefaultPath;
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

      const tempOutputDir = fs.mkdtempSync(path.join(this.outputDir, `${metadataTypeName}-`));
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
      const tempOutputDir = fs.mkdtempSync(path.join(this.outputDir, 'Package-'));

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
          const sectionKeyObj = MetadataUtils._extractSectionKey(section, sectionKeyMapping);
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
        const sectionKey = MetadataUtils._extractSectionKey(targetObject, sectionKeyMapping);
        if (sectionKey.key) {
          targetSectionMap[sectionKey.key] = targetObject;
        } else if (!sectionKey.isSectionExist) {
          utils.throwError('error.merging-metadata-xml.no-section', JSON.stringify(targetObject), logTargetFilePath);
        }
        lastSectionPoisitionMap[sectionKey.sectionName ?? ''] =
          lastSectionPoisitionMap[sectionKey.sectionName ?? ''] || sectionIndex;
      }

      sourceSectionArray.forEach((sourceObject) => {
        const sectionKey = MetadataUtils._extractSectionKey(sourceObject, sectionKeyMapping);
        if (!sectionKey.isSectionExist) {
          utils.throwError('error.merging-metadata-xml.no-section', JSON.stringify(sourceObject), logSourcefilePath);
        }
        const targetObject = targetSectionMap[sectionKey.key];
        if (targetObject) {
          if (this.command.flags['merge-props']) {
            // Merge properties from sourceObject into targetObject
            const isEquals = MetadataUtils._mergeMetadataProperties(
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
    const sfdxMainDefaultPath = MetadataUtils.getForceAppProjectMainDefaultPath();
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
      utils.logComponentMessage('progress.querying-records', label, params.query);

      // Resolve the file path to an absolute path if it is not already
      const resolvedFilePath = path.isAbsolute(params.filePath)
        ? params.filePath
        : path.resolve(process.cwd(), params.filePath);

      // Check if the file already exists and decide whether to write headers
      const fileExists = fs.existsSync(resolvedFilePath);
      const writeHeaders = !params.appendToExistingFile || !fileExists;

      // Create a write stream to write the query results to the file
      const writeStream = fs.createWriteStream(resolvedFilePath, {
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
          params.progressCallback(recordCount, filteredRecordCount);
          lastRecordsCountReported = recordCount;
        }
      };

      if (params.progressCallback) {
        // Set a timeout to report progress at regular intervals
        timeout = setInterval(() => reportProgress(), Constants.BULK_POLLING_INTERVAL);
        // Immediately report the initial progress
        reportProgress();
      }
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
            if (!writeStream.write(chunk)) {
              // Wait for the write stream to drain before continuing
              await Promise.race([once(writeStream, 'drain'), writeStreamError]);
            }
          }
        }
      };

      // Promises to handle 'error' events
      const writeStreamError = once(writeStream, 'error').then(([err]) => {
        queryStream.destroy();
        throw err;
      });

      void once(queryStream, 'error').then(([err]) => {
        throw err;
      });

      // Process the data stream

      let lastIncompleteLine = '';
      let columnsCount = 0;

      for await (const chunk of queryStream) {
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
          (!lastLine.endsWith('\n') && !lastLine.endsWith(Constants.CSV_PARSE_OPTIONS.quote)) ||
          lastLine.endsWith('\n"') ||
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

      // End the write stream after processing
      writeStream.end();

      // Wait for 'finish' event or handle errors
      await Promise.race([once(writeStream, 'finish'), writeStreamError]);

      // Destroy the query stream to prevent memory leaks
      queryStream.destroy();

      // Final progress report
      reportProgress();

      utils.logComponentMessage('success.querying-records', label, recordCount.toString());

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
   * This method does not use streaming and is suitable for small datasets.
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
      utils.logComponentMessage('progress.querying-records', label, params.query);

      // Resolve the file path to an absolute path if it is not already
      const resolvedFilePath = path.isAbsolute(params.filePath)
        ? params.filePath
        : path.resolve(process.cwd(), params.filePath);

      // Check if the file already exists and decide whether to write headers
      const fileExists = fs.existsSync(resolvedFilePath);
      const writeHeaders = !params.appendToExistingFile || !fileExists;

      // Create a write stream to write the query results to the file
      const writeStream = fs.createWriteStream(resolvedFilePath, {
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
          params.progressCallback(recordCount, filteredRecordCount);
          lastRecordsCountReported = recordCount;
        }
      };

      if (params.progressCallback) {
        // Set a timeout to report progress every specified interval
        timeout = setInterval(() => reportProgress(), Constants.BULK_POLLING_INTERVAL);
        // Immediately report the initial progress
        reportProgress();
      }

      // Perform the query using the REST API with event handlers
      const data = (
        await new Promise<any[]>((resolve, reject) => {
          const records: any[] = [];
          const queryOptions = {
            autoFetch: true,
            maxFetch: Constants.DATA_MOVE_CONSTANTS.MAX_FETCH_LIMIT,
            headers: Constants.DATA_MOVE_CONSTANTS.SFORCE_API_CALL_HEADERS,
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
          return record;
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
        writeStream.write(csvString, (err) => {
          if (err) {
            return reject(err);
          }
          writeStream.end(() => {
            resolve();
          });
        });
      });

      // Final progress report
      reportProgress();

      // Log a success message indicating the number of records processed
      utils.logComponentMessage('success.querying-records', label, recordCount.toString());

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
   * Suitable for small and medium datasets.
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
      utils.logComponentMessage('progress.querying-records', label, params.query);

      // Track the number of records processed
      let recordCount = 0;
      let filteredRecordCount = 0;
      let lastRecordsCountReported = -1;

      const reportProgress = (): void => {
        if (params.progressCallback && recordCount !== lastRecordsCountReported) {
          params.progressCallback(recordCount, filteredRecordCount);
          lastRecordsCountReported = recordCount;
        }
      };

      if (params.progressCallback) {
        // Set a timeout to report progress every specified interval
        timeout = setInterval(() => reportProgress(), Constants.BULK_POLLING_INTERVAL);
        // Immediately report the initial progress
        reportProgress();
      }

      // Perform the query using the REST API with event handlers
      const data = (
        await new Promise<any[]>((resolve, reject) => {
          const records: any[] = [];
          const queryOptions = {
            autoFetch: true,
            maxFetch: Constants.DATA_MOVE_CONSTANTS.MAX_FETCH_LIMIT,
            headers: Constants.DATA_MOVE_CONSTANTS.SFORCE_API_CALL_HEADERS,
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
          return record;
        });

      // Final progress report
      reportProgress();

      // Log a success message indicating the number of records processed
      utils.logComponentMessage('success.querying-records', label, recordCount.toString());

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
   *  Uses the simple query method to retrieve data.
   *  Suitable for tiny datasets.
   *  Provide optional support for records transformation, but not for progress reporting.
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

    try {
      // Log a message indicating the start of the query process
      utils.logComponentMessage('progress.querying-records', label, params.query);

      const queryOptions = {
        autoFetch: true,
        maxFetch: Constants.DATA_MOVE_CONSTANTS.MAX_FETCH_LIMIT,
        headers: Constants.DATA_MOVE_CONSTANTS.SFORCE_API_CALL_HEADERS,
      };

      const res = await connection.query(params.query, queryOptions);
      const data = res.records
        .map((record: any): any => {
          delete record.attributes;
          if (params.recordCallback) {
            return params.recordCallback(record);
          } else {
            return record;
          }
        })
        .filter((record: any) => !!record);

      // Log a success message indicating the number of records processed
      utils.logComponentMessage('success.querying-records', label, data.length.toString());

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return data;
    } catch (err) {
      // Handle any errors that occur during the query or file writing process
      utils.throwWithErrorMessage(err as Error, 'error.querying-records', label);
    }
  }
}
