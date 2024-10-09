/* eslint-disable no-param-reassign */
import { Constants } from '../constants.js';
import { Utils } from '../utils.js';
import { ParsedQuery } from './data-move-models.js';

export class DataMoveUtilsStatic {
  /**
   *  Parses the query string and returns the fields, object, where clause, limit and offset.
   * @param queryString  The query string to parse.
   * @returns
   */
  public static parseQueryString(queryString: string): ParsedQuery {
    const polymorphicFieldMapping = new Map<string, string>();

    let fields: string[] = [];
    let objectName = '';
    let where = '';
    let limit = 0;
    let offset = 0;

    // Extract fields and object
    const selectFromMatch = queryString.match(/SELECT\s+(.*?)\s+FROM\s+([^\s]+)(?:\s+|$)/i);
    if (selectFromMatch) {
      fields = selectFromMatch[1].split(',').map((field) => {
        field = field.trim();
        if (field.includes(Constants.DATA_MOVE_CONSTANTS.POLYMORPHIC_FIELD_SEPARATOR)) {
          const fieldParts = field.split(Constants.DATA_MOVE_CONSTANTS.POLYMORPHIC_FIELD_SEPARATOR);
          polymorphicFieldMapping.set(fieldParts[0], fieldParts[1]);
          field = fieldParts[0];
        }
        return field;
      });
      objectName = selectFromMatch[2];
    }

    // Extract where clause
    const whereMatch = queryString.match(/WHERE\s+(.*?)(?:\s+ORDER BY|\s+LIMIT|\s+OFFSET|$)/i);
    if (whereMatch?.[1]) {
      where = whereMatch[1].trim();
    }

    // Extract limit
    const limitMatch = queryString.match(/LIMIT\s+(\d+)/i);
    if (limitMatch?.[1]) {
      limit = parseInt(limitMatch[1], 10);
    }

    // Extract offset
    const offsetMatch = queryString.match(/OFFSET\s+(\d+)/i);
    if (offsetMatch?.[1]) {
      offset = parseInt(offsetMatch[1], 10);
    }

    return new ParsedQuery({
      fields,
      objectName,
      where,
      limit,
      offset,
      polymorphicFieldMapping,
    });
  }

  /**
   *  Composes the query string from the parsed query.
   * @param query  The parsed query.
   * @returns  The composed query string.
   */
  public static composeQueryString(query: ParsedQuery): string {
    let queryString = '';

    // Add fields and object
    if (query.fields && query.fields.length > 0) {
      const fieldsString = query.fields.join(', ');
      queryString += `SELECT ${fieldsString}`;
    } else {
      queryString += 'SELECT Id'; // Default fields to '*' if none are provided
    }

    if (query.objectName) {
      queryString += ` FROM ${query.objectName}`;
    } else {
      queryString += ' FROM Account';
    }

    // Add WHERE clause if present
    if (query.where) {
      queryString += ` WHERE ${query.where}`;
    }

    // Add LIMIT clause if present
    if (typeof query.limit === 'number') {
      queryString += ` LIMIT ${query.limit}`;
    }

    // Add OFFSET clause if present
    if (typeof query.offset === 'number') {
      queryString += ` OFFSET ${query.offset}`;
    }

    return queryString.trim();
  }

  /**
   *  Gets the reference field for the given field.
   * For example, if the field is 'Account__c.Name', the reference field is 'Account__r.Name'.
   * If the field is 'Account__c', the reference field is 'Account__r'.
   * If the field is 'AccountId', the reference field is 'Account'.
   * If the passed field is already a reference field, it returns the same field.
   * @param field  The field to get its reference field.
   * @returns  The reference field.
   */
  public static getRField(field: string): string {
    const fieldParts = field.split('.');
    let baseField = fieldParts[0];
    baseField = baseField.endsWith('__c')
      ? baseField.replace('__c', '__r')
      : baseField.endsWith('__pc')
      ? baseField.replace('__pc', '__pr')
      : baseField.endsWith('Id')
      ? Utils.trimEndStr(baseField, 'Id')
      : baseField;
    return `${baseField}${fieldParts.length > 1 ? fieldParts.slice(1).join('.') : ''}`;
  }

  /**
   *  Gets the field from the reference field.
   * For example, if the field is 'Account__r.Name', the reference field is 'Account__c.Name'.
   * If the field is 'Account__r', the reference field is 'Account__c'.
   * If the field is 'Account', the reference field is 'AccountId'.
   * If the passed field is already a reference field, it returns the same field.
   * @param rField  The reference field to get its field.
   * @returns  The field.
   */
  public static getCField(rField: string): string {
    const fieldParts = rField.split('.');
    let baseField = fieldParts[0];
    baseField = baseField.endsWith('__r')
      ? baseField.replace('__r', '__c')
      : baseField.endsWith('__pr')
      ? baseField.replace('__pr', '__pc')
      : !baseField.endsWith('Id')
      ? `${baseField}Id`
      : baseField;
    return `${baseField}${fieldParts.length > 1 ? fieldParts.slice(1).join('.') : ''}`;
  }

  /**
   *  Checks whether the field is a reference field.
   * @param field  The field to check.
   * @returns  True if the field is a reference field, false otherwise
   */
  public static isRField(field: string): boolean {
    return field.includes('.');
  }
}
