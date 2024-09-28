import path from 'node:path';
import fs from 'node:fs';

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { XMLParser } from 'fast-xml-parser';
import { FindMatchingFilesResult, MatchingFiles, FilenameRegexpReplacement, ObjectPath } from './types.js';

const require = createRequire(import.meta.url);
const objectPath: ObjectPath = require('object-path') as ObjectPath;

/**
 * Utils class for common functions
 */
export class Utils {
  /**
   *  Load an XML file as a JSON object.
   * @param filePath  The path to the XML file.
   * @returns  A promise resolving to the JSON object.
   */
  public static async loadXmlAsJsonAsync(
    filePath: string,
    preserveOrder: boolean = false
  ): Promise<Record<string, any>> {
    // Read the XML file content
    const xmlData = await readFile(filePath, 'utf-8');

    // Create an instance of the XMLParser
    const parser = new XMLParser({
      preserveOrder,
    });

    // Parse the XML data into a JSON object
    const jsonData = parser.parse(xmlData) as Record<string, any>;

    return jsonData;
  }

  /**
   * Find a property in a JSON object by a dot-delimited path.
   * @param obj - The JSON object to search.
   * @param folder - The dot-delimited path to the property.
   * @returns The value at the given path, or undefined if not found.
   */
  public static findPropertyByPath(obj: Record<string, any>, folder: string): any {
    return objectPath.get(obj, folder);
  }

  /**
   *  Get the similar files in two directories.
   * @param dir1  The path to the first directory.
   * @param dir2  The path to the second directory.
   * @param extension  The file extension to filter by.
   * @returns  An array of objects containing the paths to the similar files.
   */
  public static getSimilarFiles(dir1: string, dir2: string, extension?: string): MatchingFiles[] {
    const files1 = fs.readdirSync(dir1);
    const files2 = fs.readdirSync(dir2);

    const similarFiles: Array<{ dir1Path: string; dir2Path: string }> = [];

    for (const file1 of files1) {
      if (extension && !file1.endsWith(extension)) {
        continue;
      }

      const file2 = files2.find((f) => path.basename(f) === path.basename(file1));
      if (file2) {
        similarFiles.push({ dir1Path: path.join(dir1, file1), dir2Path: path.join(dir2, file2) });
      }
    }

    return similarFiles;
  }

  /**
   *  Find matching files in two directories.
   * @param dir1Files  The list of files in the first directory.
   * @param dir2Files  The list of files in the second directory.
   * @param dir1FileReplaceRegexp  The regular expression to replace in the first directory file names before comparison.
   * @param dir2FileReplaceRegexp  The regular expression to replace in the second directory file names before comparison.
   * @param dir1Replace  The string to replace the matched regular expression in the first directory file names.
   * @param dir2Replace  The string to replace the matched regular expression in the second directory file names.
   * @returns  An array of objects containing the paths to the matching files.
   */
  public static findMatchingFiles(
    dir1Files: string[],
    dir2Files: string[],
    dir1Replacement?: FilenameRegexpReplacement,
    dir2Replacement?: FilenameRegexpReplacement
  ): FindMatchingFilesResult {
    const matchingFiles: MatchingFiles[] = [];
    const missingFiles: string[] = [];

    for (const file1 of dir1Files) {
      const file1Name = path.basename(file1).replace(dir1Replacement?.regexp ?? '', dir1Replacement?.replace ?? '');
      const file2 = dir2Files.find(
        (f) => path.basename(f).replace(dir2Replacement?.regexp ?? '', dir2Replacement?.replace ?? '') === file1Name
      );
      if (file2) {
        matchingFiles.push({ dir1Path: file1, dir2Path: file2 });
      } else {
        missingFiles.push(file1);
      }
    }

    return { matchingFiles, missingFiles };
  }

  /**
   *  Copy files to a destination folder.
   * @param files  The list of files to copy.
   * @param destFolder  The destination folder path.
   * @param fileReplaceRegexp  The regular expression to replace in the file names before copying.
   * @param replace  The string to replace the matched regular expression in the file names.
   */
  public static copyFiles(files: string[], destFolder: string, fileReplacement?: FilenameRegexpReplacement): void {
    for (const file of files) {
      const fileName = path.basename(file).replace(fileReplacement?.regexp ?? '', fileReplacement?.replace ?? '');
      fs.copyFileSync(file, path.join(destFolder, fileName));
    }
  }

  /**
   * Compares two objects deeply, checking all nested properties and arrays.
   *
   * @param obj1 - The first object to compare.
   * @param obj2 - The second object to compare.
   * @returns `true` if the objects are deeply equal, `false` otherwise.
   */
  public static deepCompare(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true;

    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
      return false;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
      if (!keys2.includes(key) || !Utils.deepCompare(obj1[key], obj2[key])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Shortens a file path to a specified maximum length, ensuring the file name is always fully visible.
   * The middle part of the path will be replaced with '...', and the '/' or '\' separator before the file name
   * will also be included.
   *
   * @param filePath - The original file path.
   * @param maxLength - The maximum length of the shortened file path, including the '...'. Default is 30.
   * @returns The shortened file path.
   */
  public static shortenFilePath(filePath: string, maxLength: number = 30): string {
    if (filePath.length <= maxLength) {
      return filePath;
    }

    const separator = '...';

    // Get the file name from the file path (everything after the last slash or backslash)
    const pathSegments = filePath.split(/([\\/])/); // Split by both slashes and retain separators
    const fileName = pathSegments[pathSegments.length - 1]; // Filename is always the last part
    const separatorBeforeFile = pathSegments[pathSegments.length - 2] || ''; // Separator before filename

    // If even the file name is longer than maxLength, return only the file name
    if (fileName.length >= maxLength) {
      return fileName;
    }

    // Calculate available space for the start part of the path
    const availableLength = maxLength - fileName.length - separator.length - separatorBeforeFile.length;

    // Extract the start part of the path, limited by availableLength
    const start = filePath.slice(0, availableLength);

    // Return the shortened path with the file name and the separator before it
    return `${start}${separator}${separatorBeforeFile}${fileName}`;
  }

  /**
   * Merges properties from the source object into the target object.
   * - Overrides existing properties in the target with those from the source.
   * - Adds new properties from the source to the target.
   * - Does not remove properties from the target that are not present in the source.
   * @param target The target object to merge properties into.
   * @param source The source object to merge properties from.
   */
  public static mergeProperties(target: any, source: any): void {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = target[key];

        if (Array.isArray(sourceValue)) {
          // Handle arrays (e.g., child elements that can occur multiple times)
          // eslint-disable-next-line no-param-reassign
          target[key] = Utils._mergeArrays(targetValue, sourceValue);
        } else if (
          typeof sourceValue === 'object' &&
          sourceValue !== null &&
          typeof targetValue === 'object' &&
          targetValue !== null
        ) {
          // Recursively merge child objects
          Utils.mergeProperties(targetValue, sourceValue);
        } else {
          // Override or add the property
          // eslint-disable-next-line no-param-reassign
          target[key] = sourceValue;
        }
      }
    }
  }

  // --- Private methods ---
  /**
   * Merges two arrays of objects, combining elements with the same keys.
   * @param targetArray The target array to merge into.
   * @param sourceArray The source array to merge from.
   * @returns The merged array.
   */
  private static _mergeArrays(targetArray: any[], sourceArray: any[]): any[] {
    if (!Array.isArray(targetArray)) {
      return sourceArray;
    }

    // Assuming that array elements can be uniquely identified by some key
    // For simplicity, we will concatenate arrays and remove duplicates if necessary
    const mergedArray = [...targetArray];

    sourceArray.forEach((sourceElement) => {
      if (!mergedArray.some((targetElement) => Utils.deepCompare(targetElement, sourceElement))) {
        mergedArray.push(sourceElement);
      }
    });

    return mergedArray;
  }
}
