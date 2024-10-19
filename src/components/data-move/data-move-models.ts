import { Type } from 'class-transformer';
import 'reflect-metadata';
import { Constants } from '../constants.js';
import { OPERATION } from './data-move-types.js';

// Common Models ----------------------------------------------------------------

export class ParsedQuery {
  /** List of fields in the query. */
  public fields: string[] = [];
  /** Object name in the query. */
  public objectName: string = '';
  /** WHERE clause in the query. */
  public where: string = '';
  /** IIMIT clause in the query. */
  public limit: number = 0;
  /** OFFSET clause in the query. */
  public offset: number = 0;
  /** Mapping between lookup field names (including master-detail lookup fields) and their corresponding parent object names. */
  public lookupObjectNameMapping: Map<string, string> = new Map<string, string>();

  /**
   *  Constructs an instance of ParsedQuery.
   * @param init  Partial initialization object.
   */
  public constructor(init: Partial<ParsedQuery>) {
    Object.assign(this, init);
  }
}

/**
 * Represents extra data for an object, including mappings, fields, object names, where clauses, limits, and offsets.
 */
export class ObjectExtraData extends ParsedQuery {
  /** Mapping between the lookup field names and their corresponding parent script objects. */
  public lookupObjectMapping: Map<string, ScriptObject> = new Map<string, ScriptObject>();

  /** Mapping between master-detail object names and their corresponding parent object names. */
  public masterDetailObjectNameMapping: Map<string, string> = new Map<string, string>();

  /** Mapping between the field names in the source org and their representation in the target org. */
  public sourceToTargetFieldMapping: Map<string, string> = new Map<string, string>();

  /** Mapping between the lookup fields and their full reference fields, containing the parent external ID. For example, Account__c => Account__r.Name. */
  public lookupFieldMapping: Map<string, string> = new Map<string, string>();

  /** API name of the target object according to the field mapping. */
  public targetObjectName!: string;

  /** External ID of the target object according to the field mapping. */
  public targetExternalId!: string;

  /** Indicates if the external ID was originally missing in object settings. */
  public isExternalIdMissing!: boolean;

  /** Target WHERE clause of the query according to the field mapping. */
  public targetWhere!: string;

  /** The total number of records in the source object without filtering. */
  public totalRecords = 0;

  /** The total number of records in the target object without filtering. */
  public targetTotalRecords = 0;

  /**
   * Constructs an instance of ObjectExtraData.
   *
   * @param init - Partial initialization object.
   */
  public constructor(init: Partial<ObjectExtraData>) {
    super(init);
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

  // Working Properties ----------------------------------------------------------------

  /** Extra data of the object. */
  public extraData!: ObjectExtraData;

  /** Parsed query to fetch the records to be deleted from the target object. */
  public deleteParsedQuery!: ParsedQuery;

  /** Object set this object belongs to. */
  public objectSet!: ScriptObjectSet;

  /** Indicates if the object is completed, i.e., the records have been processed. */
  public completed: boolean = false;

  // Constructors ----------------------------------------------------------------
  /**
   * Constructs an instance of ScriptObject.
   *
   * @param init - Partial initialization object.
   */
  public constructor(init: Partial<ScriptObject>) {
    // Assign initial values from the provided partial object
    Object.assign(this, init);
  }

  // Working Methods ----------------------------------------------------------------
  /**
   *  Returns the working CSV file name for the object based on the operation and source or target.
   * @param operation  Operation to be performed on the object.
   * @param sourceOrTarget  Source or target object.
   * @returns
   */
  public getWorkingCSVFileName(operation: OPERATION, sourceOrTarget: 'source' | 'target'): string {
    if (sourceOrTarget === 'source') {
      return `${this.extraData.objectName}_${operation}_${sourceOrTarget}.csv`;
    }
    return `${this.extraData.targetObjectName}_${operation}_${sourceOrTarget}.csv`;
  }
}

/**
 * Represents a set of script objects to be processed together.
 */
export class ScriptObjectSet {
  /** List of objects in the set. */
  @Type(() => ScriptObject)
  public objects: ScriptObject[] = new Array<ScriptObject>();

  // Working  Properties ----------------------------------------------------------------

  /** Index of the object set in the script. */
  public index: number = 0;

  /** The reference to the script containing the object set. */
  public script!: Script;

  /** Names of the objects excluded from the data move process and not included in the `objects` array. */
  public excludedObjects: string[] = [];

  /** Order of objects to update records, dependent on the relationships between objects. */
  public updateObjectsOrder: string[] = [];

  /** Order of objects to delete records, dependent on the relationships between objects. */
  public deleteObjectsOrder: string[] = [];

  /** Target subdirectory to store the CSV files. */
  public targetSubDirectory: string = '';

  /** Source subdirectory to store the CSV files. */
  public sourceSubDirectory: string = '';

  // Constructors ----------------------------------------------------------------
  /**
   * Constructs an instance of ScriptObjectSet.
   *
   * @param init - Partial initialization object.
   */
  public constructor(init: Partial<ScriptObjectSet>) {
    // Assign initial values from the provided partial object
    Object.assign(this, init);
  }

  // Working Methods ----------------------------------------------------------------
  /**
   * Returns the order of objects in the object set based on the dependencies between them.
   * The algorythm is based on weights of the objects.
   * The weight of the object is calculated as follows:
   * - For each master-detail dependency, add 2 to the weight.
   * - For each lookup dependency, add 1 to the weight.
   * - The weight of the object is the sum of the weights of the objects that depend on it.
   * @returns The order of objects in the object set.
   */
  public getObjectOrder(): string[] {
    const objectMap = new Map<string, ScriptObject>();

    // Build object map
    for (const obj of this.objects) {
      objectMap.set(obj.extraData.objectName, obj);
    }

    // Build reversed dependency graph: Map from object name to set of objects that depend on it
    const reverseDependencies = new Map<string, Set<{ name: string; weight: number }>>();

    for (const obj of this.objects) {
      const objName = obj.extraData.objectName;

      // For each master-detail dependency
      for (const parentName of obj.extraData.masterDetailObjectNameMapping.values()) {
        if (!reverseDependencies.has(parentName)) {
          reverseDependencies.set(parentName, new Set());
        }
        reverseDependencies.get(parentName)!.add({ name: objName, weight: 2 }); // MD weight 2
      }

      // For each lookup dependency
      for (const parentName of obj.extraData.lookupObjectNameMapping.values()) {
        if (!reverseDependencies.has(parentName)) {
          reverseDependencies.set(parentName, new Set());
        }
        reverseDependencies.get(parentName)!.add({ name: objName, weight: 1 }); // Lookup weight 1
      }
    }

    // Now compute weights for each object
    const weights = new Map<string, number>();

    function computeWeight(objName: string, visiting: Set<string>): number {
      if (weights.has(objName)) {
        return weights.get(objName)!;
      }

      if (visiting.has(objName)) {
        // Cycle detected, avoid infinite recursion
        // Do not proceed further, but still consider the current weight
        return 0;
      }

      visiting.add(objName);

      let weight = 0;

      if (reverseDependencies.has(objName)) {
        for (const dep of reverseDependencies.get(objName)!) {
          // For each object that depends on objName
          weight += dep.weight; // Add the weight of the dependency

          if (!visiting.has(dep.name)) {
            // Only recurse if not already visiting to avoid cycles
            weight += computeWeight(dep.name, visiting);
          }
        }
      }

      visiting.delete(objName);

      weights.set(objName, weight);

      return weight;
    }

    // Compute weights for all objects
    for (const objName of objectMap.keys()) {
      const visiting = new Set<string>();
      computeWeight(objName, visiting);
    }

    // Now sort the objects by weight in decreasing order
    const sortedObjects = Array.from(objectMap.keys()).sort((a, b) => {
      const weightA = weights.get(a) || 0;
      const weightB = weights.get(b) || 0;
      return weightB - weightA;
    });

    return sortedObjects;
  }

  public getTemporarySubDirectory(): string {
    if (this.index === 1) {
      return '';
    }
    return `${Constants.DATA_MOVE_CONSTANTS.OBJECT_SET_SUB_DIRECTORY_PREFIX}${this.index}`;
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
