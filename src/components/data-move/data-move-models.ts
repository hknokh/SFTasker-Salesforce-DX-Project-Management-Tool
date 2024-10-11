import { Type } from 'class-transformer';
import 'reflect-metadata';
import { OPERATION } from './data-move-types.js';

// Common Models ----------------------------------------------------------------

/**
 * Represents extra data for an object, including mappings, fields, object names, where clauses, limits, and offsets.
 */
export class ObjectExtraData {
  /** Mapping between lookup field names and their corresponding parent object names. */
  public lookupObjectNameMapping: Map<string, string> = new Map<string, string>();

  /** Mapping between the lookup field names and their corresponding parent script objects. */
  public lookupObjectMapping: Map<string, ScriptObject> = new Map<string, ScriptObject>();

  /** Mapping between the field names in the source org and their representation in the target org. */
  public fieldMapping: Map<string, string> = new Map<string, string>();

  /** Mapping between the lookup fields and their full reference fields, containing the parent external ID. For example, Account__c => Account__r.Name. */
  public lookupFieldMapping: Map<string, string> = new Map<string, string>();

  /** Fields to select in the query. */
  public fields!: string[];

  /** Object name to query. */
  public objectName!: string;

  /** API name of the target object according to the field mapping. */
  public targetObjectName!: string;

  /** External ID of the target object according to the field mapping. */
  public targetExternalId!: string;

  /** Indicates if the external ID was originally missing in object settings. */
  public isExternalIdMissing!: boolean;

  /** WHERE clause of the query. */
  public where!: string;

  /** Target WHERE clause of the query according to the field mapping. */
  public targetWhere!: string;

  /** LIMIT of the query. */
  public limit!: number;

  /** OFFSET of the query. */
  public offset!: number;

  /**
   * Constructs an instance of ObjectExtraData.
   *
   * @param init - Partial initialization object.
   */
  public constructor(init: Partial<ObjectExtraData>) {
    // Assign initial values from the provided partial object
    Object.assign(this, init);
  }
}

// Script Models ----------------------------------------------------------------

/**
 * Represents a field and its settings for data anonymization.
 */
export class ScriptMockField {
  /** API name of the field. */
  public name: string = '';

  /** Anonymization pattern for the field, e.g., 'Name', 'Email', 'Phone'. */
  public pattern: string = '';

  /** Regular expression for fields to exclude from anonymization. */
  public excludedRegex: string = '';

  /** Regular expression for fields to include in anonymization. */
  public includedRegex: string = '';
}

/**
 * Represents a mapping between source and target fields and objects.
 */
export class ScriptMappingItem {
  /** API name of the target object to which the current object should be mapped. */
  public targetObject: string = '';

  /** API name of the source field, present in the query string of the source object. */
  public sourceField: string = '';

  /** API name of the target field to which the source field should be mapped in the target object. */
  public targetField: string = '';
}

/**
 * Represents an object in the script, including its settings and operations.
 */
export class ScriptObject {
  /** Data anonymization settings for the object. */
  @Type(() => ScriptMockField)
  public mockFields: ScriptMockField[] = new Array<ScriptMockField>();

  /** Field mapping settings for the object. */
  @Type(() => ScriptMappingItem)
  public fieldMapping: ScriptMappingItem[] = new Array<ScriptMappingItem>();

  /** SOQL query to fetch the data from the source object. */
  public query: string = '';

  /** Operation to be performed on the object. */
  public operation: OPERATION = OPERATION.Readonly;

  /** External ID field of the object, can be a complex field containing multiple fields separated by ';', e.g., 'FirstName;LastName'. */
  public externalId: string = '';

  /** Indicates if this object is excluded from the data move process. */
  public excluded: boolean = false;

  /** Indicates if this object is a master object. Master objects transfer only child records related to this object based on the query. */
  public master: boolean = true;

  /** Dedicated query string to perform a record deletion before the main data move operation. */
  public deleteQuery: string = '';

  /** Indicates if the old data should be deleted before the main data move operation. */
  public deleteOldData: boolean = false;

  /** Indicates if the records should be hard deleted, applicable when `deleteOldData` is true or operation is 'Delete'. */
  public hardDelete: boolean = false;

  /** Indicates if field mapping should be applied. */
  public useFieldMapping: boolean = false;

  /** Indicates if values mapping should be applied. */
  public useValuesMapping: boolean = false;

  /** List of API names of the fields to exclude from the data move process, useful with multiselect keywords in the query. */
  public excludedFields: string[] = [];

  /** List of API names of the fields to exclude from the update operation, retrieved from the source but not used in the update. */
  public excludedFromUpdateFields: string[] = [];

  /** Indicates if records should be skipped if they already exist in the target org. Applies to `Insert` and `Upsert` operations to prevent duplicates or convert to 'Update'. */
  public skipExistingRecords: boolean = false;

  // Working Methods and Properties ----------------------------------------------------------------

  /** Extra data of the object. */
  public extraData!: ObjectExtraData;

  /** Object set this object belongs to. */
  public objectSet!: ScriptObjectSet;

  /**
   * Constructs an instance of ScriptObject.
   *
   * @param init - Partial initialization object.
   */
  public constructor(init: Partial<ScriptObject>) {
    // Assign initial values from the provided partial object
    Object.assign(this, init);
  }
}

/**
 * Represents a set of script objects to be processed together.
 */
export class ScriptObjectSet {
  /** List of objects in the set. */
  @Type(() => ScriptObject)
  public objects: ScriptObject[] = new Array<ScriptObject>();

  // Working Methods and Properties ----------------------------------------------------------------

  /** Index of the object set in the script. */
  public index: number = 0;

  /** Names of the objects excluded from the data move process and not included in the `objects` array. */
  public excludedObjects: string[] = [];

  /**
   * Constructs an instance of ScriptObjectSet.
   *
   * @param init - Partial initialization object.
   */
  public constructor(init: Partial<ScriptObjectSet>) {
    // Assign initial values from the provided partial object
    Object.assign(this, init);
  }
}

/**
 * Represents the script containing objects and object sets.
 */
export class Script {
  /** List of objects in the script. */
  @Type(() => ScriptObject)
  public objects: ScriptObject[] = new Array<ScriptObject>();

  /** List of object sets in the script. */
  @Type(() => ScriptObjectSet)
  public objectSets: ScriptObjectSet[] = new Array<ScriptObjectSet>();
}
