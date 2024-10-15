import { Constants } from '../constants.js';
import { Utils } from '../utils.js';
import { ObjectExtraData, ScriptObject } from './data-move-models.js';

/**
 * Utility class containing static methods for data movement operations.
 */
export class DataMoveUtilsStatic {
  /**
   * Parses the query string and returns the fields, object name, where clause, limit, offset, and any object name mappings.
   *
   * @param queryString - The query string to parse.
   * @returns An object containing parsed query details.
   */
  public static parseQueryString(queryString: string): ObjectExtraData {
    // Initialize a map for object name mappings
    const lookupObjectMapping = new Map<string, string>();

    // Initialize variables to hold query components
    let fields: string[] = [];
    let objectName = '';
    let where = '';
    let limit = 0;
    let offset = 0;

    // Extract fields and object name from the SELECT and FROM clauses
    const selectFromMatch = queryString.match(/SELECT\s+(.*?)\s+FROM\s+([^\s]+)(?:\s+|$)/i);
    if (selectFromMatch) {
      fields = selectFromMatch[1].split(',').map((field) => {
        field = field.trim();
        // Check for polymorphic field separator and map object names if present
        if (field.includes(Constants.DATA_MOVE_CONSTANTS.POLYMORPHIC_FIELD_SEPARATOR)) {
          const fieldParts = field.split(Constants.DATA_MOVE_CONSTANTS.POLYMORPHIC_FIELD_SEPARATOR);
          lookupObjectMapping.set(fieldParts[0], fieldParts[1]);
          field = fieldParts[0];
        }
        return field;
      });
      objectName = selectFromMatch[2];
    }

    // Extract the WHERE clause from the query string
    const whereMatch = queryString.match(/WHERE\s+(.*?)(?:\s+ORDER BY|\s+LIMIT|\s+OFFSET|$)/i);
    if (whereMatch?.[1]) {
      where = whereMatch[1].trim();
    }

    // Extract the LIMIT value from the query string
    const limitMatch = queryString.match(/LIMIT\s+(\d+)/i);
    if (limitMatch?.[1]) {
      limit = parseInt(limitMatch[1], 10);
    }

    // Extract the OFFSET value from the query string
    const offsetMatch = queryString.match(/OFFSET\s+(\d+)/i);
    if (offsetMatch?.[1]) {
      offset = parseInt(offsetMatch[1], 10);
    }

    // Return the parsed query details encapsulated in an ObjectExtraData instance
    return new ObjectExtraData({
      fields,
      objectName,
      where,
      limit,
      offset,
      lookupObjectNameMapping: lookupObjectMapping,
    });
  }

  /**
   * Composes a query string from the parsed query object, optionally using target object names and fields.
   *
   * @param object - The script object containing query details.
   * @param useTarget - Whether to use the target object name and fields in the query. Defaults to false.
   * @returns The composed query string.
   */
  public static composeQueryString(object: ScriptObject, useTarget: boolean = false): string {
    let queryString = '';

    const query = object.extraData;
    const fieldMapping = object.extraData.fieldMapping;

    // Add SELECT clause with fields or default to 'Id' if no fields are provided
    if (query.fields && query.fields.length > 0) {
      const fieldsString = !useTarget
        ? query.fields.join(', ')
        : query.fields.map((field) => fieldMapping.get(field) ?? field).join(', ');
      queryString += `SELECT ${fieldsString}`;
    } else {
      queryString += 'SELECT Id'; // Default field
    }

    // Add FROM clause with the appropriate object name
    if (query.objectName) {
      queryString += ` FROM ${useTarget ? object.extraData.targetObjectName : query.objectName}`;
    } else {
      queryString += ' FROM Account'; // Default object
    }

    // Add WHERE clause if present
    if (query.where) {
      queryString += ` WHERE ${useTarget ? query.targetWhere : query.where} `;
    }

    // Add LIMIT clause if present
    if (typeof query.limit === 'number') {
      queryString += ` LIMIT ${query.limit} `;
    }

    // Add OFFSET clause if present
    if (typeof query.offset === 'number') {
      queryString += ` OFFSET ${query.offset} `;
    }

    // Return the composed query string, trimmed of any extra whitespace
    return queryString.trim();
  }

  /**
   * Retrieves the reference field equivalent of a given field.
   * For example, 'Account__c.Name' becomes 'Account__r.Name'.
   *
   * @param field - The field to convert to its reference form.
   * @returns The reference field.
   */
  public static getRField(field: string): string {
    const fieldParts = field.split('.');
    let baseField = fieldParts[0];
    // Replace suffixes to convert to reference fields
    baseField = baseField.endsWith('__c')
      ? baseField.replace('__c', '__r')
      : baseField.endsWith('__pc')
      ? baseField.replace('__pc', '__pr')
      : baseField.endsWith('Id')
      ? Utils.trimEndStr(baseField, 'Id')
      : baseField;
    // Reconstruct the field with any additional parts
    return `${baseField}${fieldParts.length > 1 ? fieldParts.slice(1).join('.') : ''}`;
  }

  /**
   * Retrieves the custom field equivalent of a given reference field.
   * For example, 'Account__r.Name' becomes 'Account__c.Name'.
   *
   * @param rField - The reference field to convert.
   * @returns The custom field.
   */
  public static getCField(rField: string): string {
    const fieldParts = rField.split('.');
    let baseField = fieldParts[0];
    // Replace suffixes to convert to custom fields
    baseField = baseField.endsWith('__r')
      ? baseField.replace('__r', '__c')
      : baseField.endsWith('__pr')
      ? baseField.replace('__pr', '__pc')
      : !baseField.endsWith('Id')
      ? `${baseField}Id`
      : baseField;
    // Reconstruct the field with any additional parts
    return `${baseField}${fieldParts.length > 1 ? fieldParts.slice(1).join('.') : ''}`;
  }

  /**
   * Determines whether a given field is a reference field.
   *
   * @param field - The field to check.
   * @returns True if the field is a reference field, false otherwise.
   */
  public static isRField(field: string): boolean {
    return field.includes('.');
  }

  /**
   * Maps a source object name to a target object name based on the provided mapping.
   *
   * @param objectName - The source object name to map.
   * @param object - The script object containing mapping information.
   * @returns The mapped target object name, or the original if no mapping is found.
   */
  public static mapObjectName(objectName: string, object: ScriptObject): string {
    if (!object.useFieldMapping) {
      return objectName;
    }
    // Find the target object name from the field mapping
    return object.fieldMapping.find((map) => !!map.targetObject)?.targetObject ?? objectName;
  }

  /**
   * Maps a source field to a target field based on the provided mapping.
   *
   * @param field - The source field to map.
   * @param object - The script object containing mapping information.
   * @returns The mapped target field, or the original if no mapping is found.
   */
  public static mapField(field: string, object: ScriptObject): string {
    if (!object.useFieldMapping) {
      return field;
    }
    // If the field is not a reference field, map directly
    if (!DataMoveUtilsStatic.isRField(field)) {
      return object.fieldMapping.find((map) => map.sourceField === field)?.targetField ?? field;
    }
    // If the field is a reference field, map both the reference and child fields
    const parts = field.split('.');
    const rField = parts[0];
    const cField = DataMoveUtilsStatic.getCField(rField);
    const mappedCField = object.fieldMapping.find((map) => map.sourceField === cField)?.targetField ?? cField;
    const mappedRField = DataMoveUtilsStatic.getRField(mappedCField);
    // Reconstruct the mapped field with any additional parts
    return `${mappedRField}.${parts.slice(1).join('.')}`;
  }

  /**
   * Maps a source WHERE clause to a target WHERE clause based on the provided field mappings.
   *
   * @param where - The source WHERE clause to map.
   * @param object - The script object containing mapping information.
   * @returns The mapped WHERE clause.
   */
  public static mapWhereClause(where: string, object: ScriptObject): string {
    if (!object.useFieldMapping) {
      return where;
    }

    // Define a set of operators and keywords to ignore during mapping
    const operators = new Set([
      'AND',
      'OR',
      'NOT',
      'IN',
      'LIKE',
      'EXCLUDES',
      'INCLUDES',
      '=',
      '!=',
      '<',
      '>',
      '<=',
      '>=',
      'IS',
      'NULL',
      'TRUE',
      'FALSE',
      '(',
      ')',
      ',',
      'BETWEEN',
      'HAVING',
      'ON',
      'BY',
      'WITH',
      'DISTINCT',
      'SELECT',
      'FROM',
      'GROUP',
      'ORDER',
      'LIMIT',
      'OFFSET',
    ]);

    let result = '';
    let token = '';
    let inQuotes = false;

    // Iterate through each character in the WHERE clause
    for (let i = 0; i < where.length; i++) {
      const c = where.charAt(i);

      // Toggle inQuotes when encountering quote characters
      if (c === "'" || c === '"') {
        inQuotes = !inQuotes;
        result += c;
        continue;
      }

      // If inside quotes, append character without mapping
      if (inQuotes) {
        result += c;
        continue;
      }

      // Build up tokens consisting of letters, digits, underscores, and dots
      if (/[A-Za-z0-9_.]/.test(c)) {
        token += c;
      } else {
        // If a token is built, process it
        if (token) {
          // Check if the token is not an operator or keyword
          if (!operators.has(token.toUpperCase())) {
            // Map the field using the mapField method
            token = DataMoveUtilsStatic.mapField(token, object);
          }
          result += token;
          token = '';
        }
        // Append the non-token character (e.g., operator, space)
        result += c;
      }
    }

    // Process any remaining token after the loop ends
    if (token) {
      if (!operators.has(token.toUpperCase())) {
        token = DataMoveUtilsStatic.mapField(token, object);
      }
      result += token;
    }

    return result;
  }

  /**
   * Maps a source external ID to a target external ID based on the provided mapping.
   *
   * @param externalId - The source external ID to map.
   * @param object - The script object containing mapping information.
   * @returns The mapped external ID.
   */
  public static mapExternalId(externalId: string, object: ScriptObject): string {
    if (!object.useFieldMapping) {
      return externalId;
    }
    // Split the external ID by the defined separator, map each field, and rejoin
    return externalId
      .split(Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR)
      .map((field) => DataMoveUtilsStatic.mapField(field, object))
      .join(Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR);
  }

  /**
   *  Constructs a WHERE IN clause with the given field and values, splitting into multiple clauses if necessary.
   *  Keeps maximum SOQL WHERE clause character length in mind.
   *  These clauses can be used in the REST API calls to Salesforce.
   * @param field  Field to use in WHERE IN clause
   * @param inValues  Values to use in WHERE IN clause
   * @param where  Existing WHERE clause to append to the WHERE IN clause
   * @returns  Array of splitted WHERE IN clauses
   */
  public static constructWhereInClause(field: string, inValues: any[], where: string): string[] {
    const whereClauses: string[] = [];
    const maxLength = Constants.MAX_SOQL_WHERE_CLAUSE_CHARACTER_LENGTH;
    const overheadLength = (where ? where.length : 0) + field.length + 15;

    let currentValues: string[] = [];
    let currentLength = overheadLength;

    for (const value of inValues) {
      const valueString = this.valueToSOQL(value);
      const separatorLength = currentValues.length > 0 ? 1 : 0; // ',' is 1 characters
      const valueLength = valueString.length + separatorLength;

      if (currentLength + valueLength > maxLength) {
        // Construct the where clause with currentValues
        const inClause = currentValues.join(',');
        const whereClause = `(${where}) AND (${field} IN (${inClause}))`;
        whereClauses.push(whereClause);

        // Reset currentValues and currentLength
        currentValues = [];
        currentLength = overheadLength;
      }

      // Add the value to currentValues and update currentLength
      currentValues.push(valueString);
      currentLength += valueLength;
    }

    // After the loop, if currentValues is not empty, construct the final clause
    if (currentValues.length > 0) {
      const inClause = currentValues.join(',');
      const whereClause = `(${where}) AND (${field} IN (${inClause}))`;
      whereClauses.push(whereClause);
    }

    return whereClauses;
  }

  // Private methods -----------------------------------------------------------
  /**
   *  Converts a value to a SOQL-compatible string.
   * @param value  Value to convert
   * @returns  SOQL-compatible string representation of the value
   */
  private static valueToSOQL(value: any): string {
    if (typeof value === 'string') {
      // Escape single quotes by replacing ' with \'
      const escapedValue = value.replace(/'/g, "\\'");
      return `'${escapedValue}'`;
    } else if (typeof value === 'number') {
      return value.toString();
    } else if (value instanceof Date) {
      // Format date to ISO 8601 format without milliseconds, wrapped in single quotes
      const isoString = value.toISOString().replace(/\.\d{3}Z$/, 'Z');
      return `'${isoString}'`;
      // eslint-disable-next-line eqeqeq
    } else if (value != undefined) {
      // For other types, convert to string and wrap in single quotes
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const stringValue = value.toString();
      return `'${stringValue}'`;
    } else {
      // For null or undefined values, return NULL without quotes
      return 'NULL';
    }
  }
}
