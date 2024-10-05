import * as fs from 'node:fs';
import * as path from 'node:path';
import * as unzipper from 'unzipper';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { Constants } from './constants.js';
import { SFtaskerCommand } from './models.js';
import { CommandUtils } from './command-utils.js';
import { Utils } from './utils.js';
import { PackageXmlContent, PackageXmlType } from './types.js';

type XmlSectionKey = {
  key: string;
  isSectionExist: boolean;
  sectionName?: string;
  keyName?: string;
  keyValue?: string;
};

/**
 *   Utility class for metadata-related operations.
 */
export class MetadataUtils<T> {
  private static _forceAppProjectMainDefaultPath: string;

  /**
   * Creates a new instance of the MetadataUtils class.
   * @param command  The command object used to retrieve metadata
   * @param outputDir  The output directory for the retrieved metadata
   */
  public constructor(private command: SFtaskerCommand<T>, private outputDir: string) {}

  // Public static methods ----------------------------------------------------------

  /**
   *  Checks if the current project is a force-app project.
   * @returns  true if the project is a force-app project, false otherwise
   */
  public static isForceAppProject(): boolean {
    return fs.existsSync(path.join(process.cwd(), Constants.FORCE_APP_SFDX_PROJECT_JSON));
  }

  /**
   *  Gets the default path to the force-app project main folder from from the sfdx-project.json file.
   * @returns  The default path to the force-app project main folder
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
      const sfdxProjectJson = fs.readFileSync(sfdxProjectJsonPath, 'utf8');
      const sfdxProjectJsonObj = JSON.parse(sfdxProjectJson);
      const packageDirectories: any[] = sfdxProjectJsonObj.packageDirectories;
      // Find the package directory with the default property set to true
      const forceAppProjectMainDefaultPath = packageDirectories.find(
        (packageDirectory: any) => packageDirectory.default
      );
      if (forceAppProjectMainDefaultPath) {
        // Cache the value and return it
        MetadataUtils._forceAppProjectMainDefaultPath = path.join(
          forceAppProjectMainDefaultPath.path,
          Constants.FORCE_APP_MAIN_DEFAULT_PATH
        );
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
   * @param sectionObject  The section object to extract the key from.
   * @param sectionKeyMapping  A mapping of section names to key names.
   * @returns  An object containing the key value and a boolean indicating if the section exists.
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

    // Go thru each property in the section object and look for the property with contains the section
    for (const sectionName of Object.keys(sectionObject)) {
      propIndex++;
      // Check if the section name is in the mapping or if there is a wildcard mapping matching every section name
      if (sectionKeyMapping[sectionName] || sectionKeyMapping['*']) {
        // Try to get the array of properties for the section
        const sectionArray: any[] = sectionObject[sectionName];
        // Get the key name for the section
        let keyName = sectionKeyMapping[sectionName];
        // If the key name is not found and there is a wildcard mapping, use the wildcard mapping as the key name
        // Applies only to the first property in the section object, as it should contain all the section data
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
   * Retrieve metadata from the target org using the command's connection
   * @param metadataTypeName Name of the metadata type to retrieve, for example, `Profile`.
   * @param members  List of metadata members to retrieve, default to `*` if not provided.
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
   * Retrieve package metadata and extract to a temporary directory.
   * @param packagePath The path of the package to retrieve.
   */
  public async retrievePackageMetadataAsync(packagePath: string): Promise<string | undefined> {
    const utils = new CommandUtils(this.command);
    try {
      // Log the progress of the metadata retrieval
      utils.spinnerwithComponentMessage('start', 'progress.retrieving-metadata', packagePath);

      // Read and parse the package.xml file
      const packageManifest = (await Utils.loadXmlAsJsonAsync(packagePath)) as PackageXmlContent;

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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
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
   *  Merge two metadata XML files by comparing sections by their names and key values.
   *  Updates the existing sections in the target xml file with the sections having the same key values in the source xml file.
   *  Puts the new sections after the last occurrence of the similar section in the target xml file or at the end of the file if the section does not exist.
   *  Preserves the order of the sections in the target xml file.
   * @param sourceFilePath  The path to the source metadata XML file.
   * @param targetFilePath  The path to the target metadata XML file.
   * @param outputFilePath  The path to the output metadata XML file.
   * @param rootTag The root tag of the metadata XML file, for example, `Profile` for profile metadata.
   * @param sectionKeyMapping  A mapping of section names to key names used to identify sections in the XML files.
   */
  // eslint-disable-next-line complexity
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
      const sourceXml = fs.readFileSync(sourceFilePath, 'utf8');
      const targetXml = fs.readFileSync(targetFilePath, 'utf8');

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

        utils.spinnerwithComponentMessage(
          'stop',
          'success.merging-metadata-xml',
          logSourcefilePath,
          logTargetFilePath,
          logOutputFilePath
        );
      } else {
        utils.spinnerwithComponentMessage(
          'stop',
          'success.merging-metadata-xml.no-changes',
          logSourcefilePath,
          logTargetFilePath
        );
      }
    } catch (err) {
      utils.throwWithErrorMessage(err as Error, 'error.merging-metadata-xml', logSourcefilePath, logTargetFilePath);
    }
  }

  /**
   *  lists files in the metadata folder by the given metadata type name
   * @param metadataTypeName  The metadata type name
   * @param metadataRootFolder  The root folder of the metadata, can be relative or absolute path
   * @returns  list of paths to the metadata files
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
   *  Gets the root folder of the metadata for the force-app project.
   * @param metadataTypeName  The metadata type name
   * @param metadataRootFolder  The root folder of the metadata, can be relative or absolute path
   * @returns  The path to the root folder of the metadata
   */
  public getMetadataRootFolder(metadataTypeName: string, metadataRootFolder?: string): string {
    const sfdxMainDefaultPath = MetadataUtils.getForceAppProjectMainDefaultPath();
    const flagMetaRootFolder = this.command.flags['source-dir']
      ? path.join(this.command.flags['source-dir'], Constants.FORCE_APP_MAIN_DEFAULT_PATH)
      : '';
    const rootFolder = metadataRootFolder ?? flagMetaRootFolder;
    const filePath =
      !rootFolder || !path.isAbsolute(rootFolder)
        ? path.join(
            process.cwd(),
            sfdxMainDefaultPath,
            Constants.PACKAGE_XML_METADATA_NAME_TO_SFDX_PROJECT_FOLDER_MAPPING[metadataTypeName]
          )
        : path.join(rootFolder, Constants.PACKAGE_XML_METADATA_NAME_TO_SFDX_PROJECT_FOLDER_MAPPING[metadataTypeName]);
    return filePath;
  }
}
