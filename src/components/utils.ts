import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { Readable, Writable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import csvParser from 'csv-parser';
import { stringify as stringifySync } from 'csv-stringify/sync';
import 'reflect-metadata';
import { plainToInstance, instanceToPlain } from 'class-transformer';
import { XMLParser } from 'fast-xml-parser';

import {
  FindMatchingFilesResult,
  MatchingFiles,
  FilenameRegexpReplacement,
  ObjectPath,
  FastSafeStringify,
} from './types.js';
import { Constants } from './constants.js';

/** Creates a require function for module imports */
const require = createRequire(import.meta.url);

/** Utility for object path manipulations */
const objectPath: ObjectPath = require('object-path') as ObjectPath;

/** Safe stringify utility */
const fastSafeStringify: FastSafeStringify = require('fast-safe-stringify');

/**
 * Utils class for common functions
 */
export class Utils {
  /**
   * Load an XML file as a JSON object.
   *
   * @param filePath The path to the XML file.
   * @param preserveOrder Whether to preserve the order of XML elements.
   * @returns A promise resolving to the JSON object.
   */
  public static async loadXmlAsJsonAsync(
    filePath: string,
    preserveOrder: boolean = false
  ): Promise<Record<string, any>> {
    // Read the XML file content
    const xmlData = await readFile(filePath, Constants.DEFAULT_ENCODING);

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
   *
   * @param obj The JSON object to search.
   * @param folder The dot-delimited path to the property.
   * @returns The value at the given path, or undefined if not found.
   */
  public static findPropertyByPath(obj: Record<string, any>, folder: string): any {
    return objectPath.get(obj, folder);
  }

  /**
   * Get the similar files in two directories.
   *
   * @param dir1 The path to the first directory.
   * @param dir2 The path to the second directory.
   * @param extension The file extension to filter by.
   * @returns An array of objects containing the paths to the similar files.
   */
  public static getSimilarFiles(dir1: string, dir2: string, extension?: string): MatchingFiles[] {
    const files1 = fs.readdirSync(dir1);
    const files2 = fs.readdirSync(dir2);

    const similarFiles: Array<{ dir1Path: string; dir2Path: string }> = [];

    for (const file1 of files1) {
      if (extension && !file1.endsWith(extension)) {
        continue;
      }

      // Find a matching file in the second directory
      const file2 = files2.find((f) => path.basename(f) === path.basename(file1));
      if (file2) {
        similarFiles.push({ dir1Path: path.join(dir1, file1), dir2Path: path.join(dir2, file2) });
      }
    }

    return similarFiles;
  }

  /**
   * Find matching files in two directories.
   *
   * @param dir1Files The list of files in the first directory.
   * @param dir2Files The list of files in the second directory.
   * @param dir1Replacement The replacement pattern for first directory file names.
   * @param dir2Replacement The replacement pattern for second directory file names.
   * @returns An object containing matching and missing files.
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
      // Replace patterns in the first directory file name
      const file1Name = path.basename(file1).replace(dir1Replacement?.regexp ?? '', dir1Replacement?.replace ?? '');

      // Find a corresponding file in the second directory after replacement
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
   * Copy files to a destination folder.
   *
   * @param sourceFiles The list of full paths to the source files.
   * @param destFolder The destination folder path.
   * @param fileReplacement The replacement pattern for file names.
   */
  public static copyFiles(
    sourceFiles: string[],
    destFolder: string,
    fileReplacement?: FilenameRegexpReplacement
  ): void {
    for (const file of sourceFiles) {
      // Replace patterns in the file name
      const fileName = path.basename(file).replace(fileReplacement?.regexp ?? '', fileReplacement?.replace ?? '');

      // Copy the file to the destination folder
      fs.copyFileSync(file, path.join(destFolder, fileName));
    }
  }

  /**
   * Compares two objects deeply, checking all nested properties and arrays.
   *
   * @param obj1 The first object to compare.
   * @param obj2 The second object to compare.
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
   * @param filePath The original file path.
   * @param maxLength The maximum length of the shortened file path, including the '...'. Default is 30.
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
   *
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
          target[key] = sourceValue;
        }
      }
    }
  }

  /**
   * Converts a plain object to a class instance.
   *
   * @param cls The class to convert to.
   * @param plain The plain object to convert.
   * @returns The class instance.
   */
  public static plainToCLass<T>(cls: new () => T, plain: any): T {
    const instance = plainToInstance(cls, plain);
    // Workaround for Map objects not being cloned properly
    const anyInstance = instance as any;
    Object.keys(anyInstance).forEach((key: string) => {
      const value = plain[key];
      if (value instanceof Map) {
        anyInstance[key] = new Map([...value]);
      }
    });
    return instance;
  }

  /**
   * Converts a class instance to a plain object.
   *
   * @param obj The class instance to convert.
   * @returns The plain object.
   */
  public static classToPlain<T>(obj: T): any {
    const plain = instanceToPlain(obj);
    // Workaround for Map objects not being converted to plain objects
    Object.keys(plain).forEach((key: string) => {
      const value = (obj as any)[key];
      if (value instanceof Map) {
        plain[key] = new Map([...value]);
      }
    });
    return plain;
  }

  /**
   * Deep clones an object by converting it to a plain object and then back to a class instance.
   *
   * @param obj The object to clone.
   * @returns The cloned object.
   */
  public static deepClone<T>(obj: T): T {
    const plain = Utils.classToPlain(obj);
    return Utils.plainToCLass((obj as any).constructor, plain);
  }

  /**
   * Removes duplicate elements from a string array.
   *
   * @param array The array to remove duplicates from.
   * @returns The array with duplicates removed.
   */
  public static distinctStringArray(array: string[]): string[] {
    return [...new Set(array)];
  }

  /**
   * Removes duplicate elements from an array of objects by a specified key.
   *
   * @param array The array to remove duplicates from.
   * @param key The key to compare objects by.
   * @returns The array with duplicates removed.
   */
  public static distinctArrayBy(array: any[], key: string): any[] {
    return array.filter((v, i, a) => a.findIndex((t) => t[key] === v[key]) === i);
  }

  /**
   * Trims a string from the end if it ends with a specified substring.
   *
   * @param str The string to trim.
   * @param toTrim The substring to trim from the end.
   * @returns The trimmed string.
   */
  public static trimEndStr(str: string, toTrim: string): string {
    if (str.endsWith(toTrim)) {
      return str.substring(0, str.lastIndexOf(toTrim));
    } else {
      return str;
    }
  }

  /**
   * Converts an object to a formatted JSON string, handling circular references safely.
   * This method converts maps to objects before stringifying.
   *
   * @param obj The object to stringify.
   * @returns The formatted JSON string.
   */
  public static stringifyFormattedSafe(obj: any): string {
    return fastSafeStringify(
      obj,
      (key, value): unknown => {
        if (value instanceof Map) {
          return Object.fromEntries(value) as unknown;
        }
        return value as unknown;
      },
      2
    );
  }

  /**
   * Replaces all occurrences of a substring in a string with a specified value.
   *
   * @param stringToReplace The string to replace substrings in.
   * @param substringToReplace The substring to be replaced.
   * @param predicate A function that returns the replacement value for each substring.
   * @returns The string with all occurrences of the substring replaced.
   */
  public static replaceString(
    stringToReplace: string,
    substringToReplace: string,
    predicate: (substring: string) => string
  ): string {
    // Escape special regex characters in substringToReplace
    const escapedSubstringToReplace = substringToReplace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedSubstringToReplace, 'g');

    // Replace all occurrences using the predicate function
    return stringToReplace.replace(regex, (substring) => predicate(substring));
  }

  /**
   * Capitalizes the first letter of a string.
   *
   * @param str The string to capitalize.
   * @returns The string with the first letter capitalized.
   */
  public static capitalizeFirstLetter(str: string): string {
    // eslint-disable-next-line eqeqeq
    if (str == undefined || str.length === 0) {
      return str;
    }
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   *  Creates a readable stream for reading objects from a CSV file.
   *
   * @param filePath  The path to the CSV file.
   * @param recordCallback  The optional callback function to process each record read from the CSV file.
   * @returns  The readable stream for reading objects from the CSV file.
   */
  public static createCsvReadableFileStream(filePath: string, recordCallback?: (rawRecord: any) => any): Readable {
    const inputStream = fs
      .createReadStream(filePath, {
        encoding: Constants.DEFAULT_ENCODING,
        highWaterMark: Constants.DEFAULT_FILE_READ_STREAM_HIGH_WATER_MARK,
      })
      .pipe(
        csvParser({
          ...Constants.CSV_PARSE_OPTIONS,
        })
      );

    // Create a new readable stream to transform objects into Buffer or string
    let firstRow = true;
    const outputStream = new Readable({
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      read() {
        inputStream.on('data', (row: Record<string, string>) => {
          if (recordCallback) {
            row = recordCallback(row);
          }
          let csvData = stringifySync([row], {
            ...Constants.CSV_STRINGIFY_OPTIONS,
            header: firstRow,
            bom: false,
          });
          // Remove BOM from the first row
          if (firstRow) {
            csvData = Utils.replaceBOM(csvData);
          }
          this.push(csvData + os.EOL);
          firstRow = false;
        });

        inputStream.on('end', () => {
          // Signal end of the stream
          this.push(null);
        });

        inputStream.on('error', (err: Error) => {
          // Handle error and close the stream
          this.destroy(err);
        });
      },
    });
    return outputStream;
  }

  /**
   * Creates a writable stream for writing objects to a CSV file.
   *
   * @param filePath The path to the CSV file.
   * @param columns  The optional array of column names for the CSV file. If not provided or empty, columns will be auto-detected from the objects.
   *                 If provided, the columns will be always written as the first row in the CSV file event no objects are written.
   *                 If not provided and no rows are written, the CSV file will be empty.
   * @returns  The writable stream for writing objects to the CSV file.
   */
  public static createCsvWritableFileStream(
    filePath: string,
    columns?: string[]
  ): Writable & {
    /**
     *  Writes objects to the CSV file.
     * @param data  The object or array of objects to write to the CSV file.
     */
    writeObjects(data: any): void;
  } {
    const outputStream = fs.createWriteStream(filePath, {
      flags: 'w',
      encoding: Constants.DEFAULT_ENCODING,
      highWaterMark: Constants.DEFAULT_FILE_WRITE_STREAM_HIGH_WATER_MARK,
    });

    // Create a writable stream in object mode
    const writableStream = new Writable({
      objectMode: true,
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      write(chunk, encoding, callback) {
        // Since we're handling writes via writeObjects, this can be left empty
        callback();
      },
    });

    let firstRow = true;

    if (columns && columns.length > 0) {
      let csvData = stringifySync([], {
        ...Constants.CSV_STRINGIFY_OPTIONS,
        header: true,
        bom: false,
        columns,
      });
      csvData = Utils.replaceBOM(csvData);
      outputStream.write(csvData);
      firstRow = false;
    }

    // Add the writeObjects method to the writable stream
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    (writableStream as any).writeObjects = function (data: any) {
      const dataArray = Array.isArray(data) ? data : [data];

      let csvData = stringifySync(dataArray, {
        ...Constants.CSV_STRINGIFY_OPTIONS,
        header: firstRow,
        bom: false,
      });

      // Remove BOM from the first row if necessary
      if (firstRow) {
        csvData = Utils.replaceBOM(csvData);
      }
      outputStream.write(csvData);
      firstRow = false;
    };

    // When the writable stream ends, end the output stream as well
    writableStream.on('finish', () => {
      outputStream.end();
    });

    // Forward any errors from the output stream to the writable stream
    outputStream.on('error', (err) => {
      writableStream.destroy(err);
    });

    return writableStream as Writable & { writeObjects(data: any): void };
  }

  /**
   * Replaces the BOM (Byte Order Mark) from a string.
   *
   * @param str The string to replace the BOM from.
   * @returns The string with the BOM replaced.
   */
  public static replaceBOM(str: string): string {
    return str.replace(/^\uFEFF/gm, '').replace(/^\u00BB\u00BF/gm, '');
  }

  /**
   *  Returns the common fields in all keys of a map.
   * @param map  The map of keys to arrays of fields.
   * @returns  The array of common fields in all keys.
   */
  public static getCommonFieldsInAllKeys(map: Map<string, string[]>): string[] {
    const iterator = map.values();
    const firstSet = new Set(iterator.next().value); // Start with the first set of fields

    for (const fields of iterator) {
      for (const field of firstSet) {
        if (!fields.includes(field)) {
          firstSet.delete(field); // Remove field if it is not present in the current set
        }
      }
    }

    return Array.from(firstSet); // Convert the set back to an array
  }

  /**
   * Writes an empty CSV file with only the header row.
   * @param filePath - The path to the CSV file to be written.
   * @param columns - An array of strings representing the header columns.
   */
  public static writeEmptyCsvFile(filePath: string, columns: string[]): void {
    const stream = Utils.createCsvWritableFileStream(filePath, columns);
    stream.end();
  }

  /**
   * Truncates a string to the specified maximum length, appending "..." if truncated.
   * @param str The string to truncate.
   * @param maxLength The maximum allowed length.
   * @returns The truncated string with "..." appended if truncation occurred.
   */
  public static truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) {
      return str.trim();
    }
    return str.substring(0, maxLength - 3).trim() + '...';
  }

  // --- Private methods ---
  /**
   * Merges two arrays of objects, combining elements with the same keys.
   *
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
