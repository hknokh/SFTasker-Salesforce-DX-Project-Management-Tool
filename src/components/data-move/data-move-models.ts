/* eslint-disable import/no-extraneous-dependencies */
import { Type } from 'class-transformer';
import 'reflect-metadata';
import { SObjectDescribe } from '../models.js';
import { OPERATION, ReferenceFieldData } from './data-move-types.js';

// Common Models ----------------------------------------------------------------
/**
 * Class holds the components of the parsed query string.
 */
export class ParsedQuery {
  /**
   * The mapping between the source and target fields.
   */
  public fieldMapping!: Map<string, string>;

  /**
   * The mapping between the polymorphic fields and their object types.
   */
  public polymorphicFieldMapping!: Map<string, string>;

  /**
   * The mapping between the referenced field names and their data,
   * for example, Account__c => Account__r.Name
   * Note: This property is populated only for `target` ParsedQuery object.
   * This field is populted for source ParsedQuery object only.
   * @type {Map<string, ReferencedField>}
   */
  public referencedFieldsMap: Map<string, ReferenceFieldData> = new Map<string, ReferenceFieldData>();

  /**
   * The fields to exclude from the data move process.
   * Note: This property is populated only for `target` ParsedQuery object.
   */
  public excludedFromUpdateFields = new Array<string>();

  /**
   * The fields to select in the query.
   */
  public fields!: string[];
  /**
   * The object name to query.
   */
  public objectName!: string;
  /**
   * The where clause of the query.
   */
  public where!: string;
  /**
   * The limit of the query.
   */
  public limit!: number;
  /**
   * The offset of the query.
   */
  public offset!: number;

  /**
   * The external id field of the object used for update operations.
   */
  public externalId!: string;

  public constructor(init: Partial<ParsedQuery>) {
    Object.assign(this, init);
  }
}

/**
 * Class for the field for data anonymization.
 */
export class ScriptMockField {
  /**
   * Api name of the field.
   *
   * @type {string}
   * @memberof ScriptMockField
   */
  public name: string = '';

  /**
   * Anonymization pattern for the field.
   * For example, 'Name' for name fields, 'Email' for email fields, 'Phone' for phone fields, etc.
   *
   * @type {string}
   * @memberof ScriptMockField
   */
  public pattern: string = '';

  /**
   * Regular expression for fields to exclude from anonymization.
   *
   * @type {string}
   * @memberof ScriptMockField
   */
  public excludedRegex: string = '';

  /**
   * Regular expression for fields to include in anonymization.
   *
   * @type {string}
   * @memberof ScriptMockField
   */
  public includedRegex: string = '';
}

/**
 * Class for the field mapping item.
 */
export default class ScriptMappingItem {
  /**
   * The api name of target object which the current object should be mapped to.
   *
   * @type {string}
   * @memberof ScriptMappingItem
   */
  public targetObject: string = '';

  /**
   * The api name of the source field.
   * This field should be present in the query string of the source object.
   * @type {string}
   * @memberof ScriptMappingItem
   */
  public sourceField: string = '';

  /**
   * The api name of the target field.
   * This is the field which the source field should be mapped to in the target object.
   *
   * @type {string}
   * @memberof ScriptMappingItem
   */
  public targetField: string = '';
}

/**
 * Class for the object in the script.
 */
export class ScriptObject {
  // Inner Types ----------------------------------------------------------------
  /**
   * The data anonymization settings for the object.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  @Type(() => ScriptMockField)
  public mockFields: ScriptMockField[] = new Array<ScriptMockField>();

  /**
   * The field mapping settings for the object.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  @Type(() => ScriptMappingItem)
  public fieldMapping: ScriptMappingItem[] = new Array<ScriptMappingItem>();

  // Properties ----------------------------------------------------------------
  /**
   * SOQL query to fetch the data from the source object.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public query: string = '';

  /**
   * The operation to be performed on the object.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public operation: OPERATION = OPERATION.Readonly;

  /**
   * The external id field of the object.
   * Can be complex field containing multiple fields, separated by ';', for example, 'FirstName;LastName'.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public externalId: string = '';

  /**
   * true if this object is excluded from the data move process.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public excluded: boolean = false;

  /**
   * true if this object is a master object.
   * Master meaning that plugin will transfer only the child records of other object which are related to this object.
   * For master object, plugin will transfer only the records determined by the query.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public master: boolean = true;

  /**
   * The dedicated query string to perform a record deletion before the main data move operation.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public deleteQuery: string = '';

  /**
   * true if the old data should be deleted before the main data move operation.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public deleteOldData: boolean = false;

  /**
   * true if the records should be hard deleted.
   * Applied both when `deleteOldData` is true and when the operation is 'Delete'.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public hardDelete: boolean = false;

  /**
   * true if fiewld mapping should be applied.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public useFieldMapping: boolean = false;

  /**
   * true if values mapping should be applied.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public useValuesMapping: boolean = false;

  /**
   * List of api names of the fields to exclude from the data move process.
   * Usefull when multiselect keywords are used in the query.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public excludedFields: string[] = [];

  /**
   * List of api names of the fields to exclude from the update operation.
   * Even thru these fields are still retrieved from the source object, they are not used in the update operation.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public excludedFromUpdateFields: string[] = [];

  /**
   * true if the records should be skipped if they already exist in the target org.
   * Applied when oiperation is `Insert` or `Upsert` and insertion is performed.
   * For `Insert` operation, it skips the records which exist in the target org, which prevents inserting duplicates.
   * For `Upsert` operation, it turns it into 'Update' operation since new records are never inserted.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public skipExistingRecords: boolean = false;

  // Working Methods and Properties ----------------------------------------------------------------

  /**
   * The parsed query string object.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public parsedQuery!: ParsedQuery;

  /**
   * The parsed query for target org concidering the field mapping.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public targetParsedQuery!: ParsedQuery;

  /**
   * The object set this object belongs to.
   *
   * @type {ScriptObjectSet}
   * @memberof ScriptObject
   */
  public objectSet!: ScriptObjectSet;

  /**
   * The description of this object in the source org.
   *
   * @type {number}
   * @memberof ScriptObject
   */
  public sourceDescribe!: SObjectDescribe;

  /**
   * The description of this object in the target org.
   *
   * @type {number}
   * @memberof ScriptObject
   */
  public targetDescribe!: SObjectDescribe;

  /**
   * Whether this field is to use for target org only.
   *
   * @type {string}
   * @memberof ScriptObject
   */
  public isForTargetOnly: boolean = false;

  // Constructor ----------------------------------------------------------------
  public constructor(init: Partial<ScriptObject>) {
    Object.assign(this, init);
  }
}

/**
 * Class represents set of objects in the script.
 * Each object set contains a list of objects to be processed together.
 */
export class ScriptObjectSet {
  /**
   * List of objects in the set.
   *
   * @type {string}
   * @memberof ScriptObjectSet
   */
  @Type(() => ScriptObject)
  public objects: ScriptObject[] = new Array<ScriptObject>();

  // Working Methods and Properties ----------------------------------------------------------------
  /**
   * The index of the object set in the script.
   *
   * @type {number}
   * @memberof ScriptObjectSet
   */
  public index: number = 0;

  // Constructor ----------------------------------------------------------------
  public constructor(init: Partial<ScriptObjectSet>) {
    Object.assign(this, init);
  }
}

/**
 * Class represents the script.
 */
export class Script {
  /**
   * List of objects in the script.
   *
   * @type {string}
   * @memberof Script
   */
  @Type(() => ScriptObject)
  public objects: ScriptObject[] = new Array<ScriptObject>();

  /**
   * List of object sets in the script.
   *
   * @type {string}
   * @memberof Script
   */
  @Type(() => ScriptObjectSet)
  public objectSets: ScriptObjectSet[] = new Array<ScriptObjectSet>();
}
