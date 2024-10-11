import path from 'node:path';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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
