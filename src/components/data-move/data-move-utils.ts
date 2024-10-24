import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { CommandUtils } from '../command-utils.js';
import { Constants } from '../constants.js';
import {
  ApiOperation,
  DataOriginType,
  IngestJobInfo,
  QueryAsyncParameters,
  QueryJobInfo,
  UpdateAsyncParameters,
} from '../types.js';
import { SFtaskerCommand, SObjectDescribe, SObjectFieldDescribe } from '../models.js';
import { Utils } from '../utils.js';
import { ApiUtils } from '../api-utils.js';
import { ObjectExtraData, ParsedQuery, Script, ScriptObject, ScriptObjectSet } from './data-move-models.js';
import { DataMoveUtilsStatic } from './data-move-utils-static.js';
import { OPERATION } from './data-move-types.js';

const pipelineAsync = promisify(pipeline);

/**
 * Utility class for data-move command operations.
 *
 * @template T The type parameter for the command.
 */
export class DataMoveUtils<T> {
  // Public properties ----------------------------------------------------------

  /** The script containing the data move configurations. */
  public script!: Script;

  /** Directory path for configurations. */
  public configDir!: string;

  /** Directory path for source CSV files. */
  public sourceDir!: string;

  /** Directory path for target CSV files. */
  public targetDir!: string;

  /** Temporary directory path for intermediate files. */
  public tempDir!: string;

  /** Map of source object descriptions keyed by object name. */
  public sourceSObjectDescribeMap: Map<string, SObjectDescribe> = new Map();

  /** Map of target object descriptions keyed by object name. */
  public targetSObjectDescribeMap: Map<string, SObjectDescribe> = new Map();

  /** Map of parsed object queries keyed by object name per object set. */
  public scriptSetParsedObjectQueryMap = new Map<ScriptObjectSet, Map<ScriptObject, ParsedQuery>>();

  // Private properties ---------------------------------------------------------
  /** Utility class for API operations. */
  private appUtils!: ApiUtils<T>;

  /** Utility class for command operations. */
  private comUtils!: CommandUtils<T>;

  // Constructor ----------------------------------------------------------------

  /**
   * Constructs a new instance of the DataMoveUtils class.
   *
   * @param command The command to process.
   */
  public constructor(private command: SFtaskerCommand<T>) {
    // Initialize utility classes
    this.appUtils = new ApiUtils(this.command);
    this.comUtils = new CommandUtils(this.command);
  }

  // Utility methods -----------------------------------------------------------

  /**
   * Describes an object for both source and target connections.
   *
   * @param object The object to describe.
   * @returns A promise that resolves when the object is described.
   */
  public async describeObjectAsync(object: ScriptObject): Promise<void> {
    // Describe the source object if the data origin is an org and not already described
    if (!this.sourceSObjectDescribeMap.has(object.extraData.objectName)) {
      if (
        object.extraData.objectName !== object.extraData.targetObjectName ||
        this.command.sourceDataOriginType === DataOriginType.org
      ) {
        try {
          // Fetch and store the source object metadata
          const sourceDescribe = (await this.appUtils.getSObjectMetadataAsync(
            object.extraData.objectName,
            this.command.sourceDataOriginType === DataOriginType.org
          )) as SObjectDescribe;
          this.sourceSObjectDescribeMap.set(object.extraData.objectName, sourceDescribe);
        } catch (error) {
          // Handle missing source object in metadata
          this.comUtils.throwCommandError(
            'error.missing-object-in-metadata',
            object.objectSet.index.toString(),
            this.command.sourceConnectionLabel,
            object.extraData.objectName
          );
        }
      }
      if (
        this.command.targetDataOriginType !== DataOriginType.org &&
        object.extraData.targetObjectName === object.extraData.objectName
      ) {
        // Use source description for target if applicable
        this.targetSObjectDescribeMap.set(
          object.extraData.targetObjectName,
          this.sourceSObjectDescribeMap.get(object.extraData.targetObjectName) as SObjectDescribe
        );
      }
    }

    // Describe the target object if the data origin is an org and not already described
    if (!this.targetSObjectDescribeMap.has(object.extraData.targetObjectName)) {
      if (
        object.extraData.targetObjectName !== object.extraData.objectName ||
        this.command.targetDataOriginType === DataOriginType.org
      ) {
        try {
          // Fetch and store the target object metadata
          const targetDescribe = (await this.appUtils.getSObjectMetadataAsync(
            object.extraData.targetObjectName,
            !(this.command.targetDataOriginType === DataOriginType.org)
          )) as SObjectDescribe;
          this.targetSObjectDescribeMap.set(object.extraData.targetObjectName, targetDescribe);
        } catch (error) {
          if (this.command.targetDataOriginType === DataOriginType.org) {
            // Throw error if target object is missing in org metadata
            this.comUtils.throwCommandError(
              'error.missing-object-in-metadata',
              object.objectSet.index.toString(),
              this.command.targetConnectionLabel,
              object.extraData.targetObjectName
            );
          }
          // Use source description for target if target is a CSV file
          const sourceDescribe = this.sourceSObjectDescribeMap.get(object.extraData.objectName) as SObjectDescribe;
          this.targetSObjectDescribeMap.set(object.extraData.targetObjectName, sourceDescribe);
        }
      }
      if (
        this.command.sourceDataOriginType !== DataOriginType.org &&
        object.extraData.objectName === object.extraData.targetObjectName
      ) {
        // Use target description for source if applicable
        this.sourceSObjectDescribeMap.set(
          object.extraData.objectName,
          this.targetSObjectDescribeMap.get(object.extraData.objectName) as SObjectDescribe
        );
      }
    }
  }

  /**
   * Adds multiselect fields to the object's fields based on the source object's description.
   *
   * @param object The object to add the multiselect fields to.
   */
  public includeMultiselectFields(object: ScriptObject): void {
    // Check if the object has multiselect fields
    const hasMultiselectFields = object.extraData.fields.some(
      (field) =>
        field === Constants.DATA_MOVE_CONSTANTS.ALL_FIELDS_KEYWORD ||
        field.endsWith('_true') ||
        field.endsWith('_false')
    );

    if (!hasMultiselectFields) {
      return;
    }

    // Log inclusion of multiselect fields
    this.comUtils.logCommandMessage(
      'process.including-multiselect-fields',
      object.objectSet.index.toString(),
      object.extraData.objectName
    );

    // Retrieve the source object description
    const describe = this.sourceSObjectDescribeMap.get(object.extraData.objectName) as SObjectDescribe;

    // Map and flatten fields, handling multiselect and filter keywords
    const multiselectFieldToFieldsMap = new Map<string, string[]>();
    object.extraData.fields.forEach((field) => {
      if (field === Constants.DATA_MOVE_CONSTANTS.ALL_FIELDS_KEYWORD) {
        // Map the 'all' keyword to all fields from the description
        multiselectFieldToFieldsMap.set(
          field,
          describe.fields.map((f) => f.name)
        );
      }
      if (field.endsWith('_true') || field.endsWith('_false')) {
        // Map fields with '_true' or '_false' suffixes to filter based on field properties
        const sObjectFieldKeyToEvaluate = field
          .replace('_true', '')
          .replace('_false', '') as keyof SObjectFieldDescribe;
        multiselectFieldToFieldsMap.set(
          field,
          describe.fields
            .filter((describeField) => describeField[sObjectFieldKeyToEvaluate] === field.endsWith('_true'))
            .map((f) => f.name)
        );
      }
    });

    object.extraData.fields = Utils.getCommonFieldsInAllKeys(multiselectFieldToFieldsMap);
  }

  /**
   * Retrieves the default external ID for a given object based on its metadata.
   *
   * @param objectName The name of the object.
   * @param useTargetConnection Whether to use the target connection's metadata.
   * @returns The default external ID field name.
   */
  public getDefaultExternalId(objectName: string, useTargetConnection: boolean = false): string {
    // Return a predefined default external ID if available
    if (Constants.DATA_MOVE_CONSTANTS.DEFAULT_EXTERNAL_ID.get(objectName)) {
      return Constants.DATA_MOVE_CONSTANTS.DEFAULT_EXTERNAL_ID.get(objectName) as string;
    }

    // Retrieve the object's metadata based on the connection type
    const metadata = useTargetConnection
      ? this.targetSObjectDescribeMap.get(objectName)
      : this.sourceSObjectDescribeMap.get(objectName);

    // Collect candidate fields that can serve as external IDs
    const externalIdFieldsCandidates = metadata
      ? [
          ...metadata.fields.filter((field) => field.nameField),
          ...metadata.fields.filter((field) => field.autoNumber),
          ...metadata.fields.filter((field) => field.unique),
        ]
      : [];

    // Return the first available candidate or default to 'Id'
    if (externalIdFieldsCandidates.length > 0) {
      return externalIdFieldsCandidates[0].name;
    }
    return 'Id';
  }

  /**
   *  Sets up the object data for processing.
   *
   * @param object The object to process.
   * @param objectSet The object set containing the object.
   * @returns A promise that resolves when the object is processed.
   */
  public async prepareObjectDataAsync(object: ScriptObject, objectSet: ScriptObjectSet): Promise<void> {
    // Create extraData object ****************************************************
    // Parse the object's query string into structured data
    object.extraData = DataMoveUtilsStatic.parseQueryString(object.query, ObjectExtraData);

    // Parse the object's delete query string into structured data
    if (object.deleteQuery) {
      object.extraData.deleteParsedQuery = DataMoveUtilsStatic.parseQueryString(object.deleteQuery, ParsedQuery);
    } else {
      if (object.operation === OPERATION.Update && object.deleteOldData) {
        this.comUtils.throwCommandError(
          'error.delete-query-missing-delete-old-data-and-update-operation',
          objectSet.index.toString(),
          object.extraData.objectName
        );
      }
      object.extraData.deleteParsedQuery = new ParsedQuery(Utils.deepClone(object.extraData));
    }
    object.extraData.deleteParsedQuery.fields = ['Id'];
    if (object.extraData.objectName !== object.extraData.deleteParsedQuery.objectName) {
      this.comUtils.throwCommandError(
        'error.delete-query-object-mismatch',
        objectSet.index.toString(),
        object.extraData.objectName,
        object.extraData.objectName,
        object.extraData.deleteParsedQuery.objectName
      );
    }

    // Assign objectSet reference to the object ***********************************
    object.objectSet = objectSet;

    // Map the object name to its target counterpart ******************************
    object.extraData.targetObjectName = DataMoveUtilsStatic.mapObjectName(object.extraData.objectName, object);

    // Adjust the delete query object name if it's different from the main object name
    if (object.extraData.deleteParsedQuery) {
      object.extraData.deleteParsedQuery.objectName = object.extraData.targetObjectName;
    }

    // Describe the object to retrieve metadata ***********************************
    await this.describeObjectAsync(object);

    // Set operation type **********************************************************
    if (this.command.targetDataOriginType === DataOriginType.csvfile) {
      // If the target is a CSV file, set the operation to Insert
      object.operation = OPERATION.Insert;
    }

    // Set external ID field ******************************************************
    // Retrieve the source object's description
    const objectDescribe = this.sourceSObjectDescribeMap.get(object.extraData.objectName) as SObjectDescribe;
    const targetObjectDescribe = this.targetSObjectDescribeMap.get(
      object.extraData.targetObjectName
    ) as SObjectDescribe;

    let isExternalIdSet = false;
    if (object.operation === OPERATION.Insert) {
      // Use 'Id' as external ID for insert operations
      object.externalId = 'Id';
      isExternalIdSet = true;
    } else if (!object.externalId) {
      // Assign default external ID if missing
      object.extraData.isExternalIdMissing = true;
      object.externalId = this.getDefaultExternalId(object.extraData.objectName);
      isExternalIdSet = true;
    }

    if (!isExternalIdSet) {
      // Log setting of external ID
      this.comUtils.logCommandMessage(
        'process.setting-external-id',
        objectSet.index.toString(),
        object.extraData.objectName,
        object.externalId
      );
    }

    // Ensure external ID fields are included in the fields list
    object.externalId.split(Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR).forEach((field) => {
      if (!object.extraData.fields.includes(field)) {
        object.extraData.fields.push(field);
        // Exclude external ID fields from updates if not in original query
        object.excludedFromUpdateFields.push(field);
      }
    });

    // Include fields ***************************************************************
    // Include multiselect fields based on the object's description
    this.includeMultiselectFields(object);

    // Exclude fields ****************************************************************
    this.comUtils.logCommandMessage(
      'process.excluding-fields',
      objectSet.index.toString(),
      object.extraData.objectName
    );
    // Exclude any fields specified in the excludedFields list
    object.extraData.fields = object.extraData.fields.filter((field) => !object.excludedFields.includes(field));

    // Further filter fields based on their descriptions and lookup relationships
    object.extraData.fields = object.extraData.fields.filter((field) => {
      // Always include reference fields and the 'Id' field
      if (DataMoveUtilsStatic.isRField(field) || field === 'Id') {
        return true;
      }

      // Retrieve the field's description
      const fieldDescribe = objectDescribe.fieldsMap.get(field) as SObjectFieldDescribe;
      // Retrieve the target field's description using the field mapping
      const targetField = DataMoveUtilsStatic.mapField(field, object);
      const fieldTargetDescribe = targetObjectDescribe.fieldsMap.get(targetField) as SObjectFieldDescribe;

      if (!object.excludedFromUpdateFields.includes(field)) {
        // Exclude the field if it's readonly or not described in source metadata
        if (!fieldDescribe || fieldDescribe.readonly) {
          this.comUtils.logCommandMessage(
            'process.field-not-found-in-metadata-or-readonly',
            objectSet.index.toString(),
            object.extraData.objectName,
            this.command.sourceConnectionLabel,
            field
          );
          return false;
        }

        // Exclude the field if it's readonly or not described in target metadata
        if (
          (!fieldTargetDescribe || fieldTargetDescribe.readonly) &&
          this.command.targetDataOriginType === DataOriginType.org
        ) {
          this.comUtils.logCommandMessage(
            'process.field-not-found-in-metadata-or-readonly',
            objectSet.index.toString(),
            object.extraData.targetObjectName,
            this.command.targetConnectionLabel,
            targetField
          );
          return false;
        }
      }

      // Exclude objects ****************************************************************
      // Handle lookup fields by mapping referenced object names
      if (fieldDescribe.isLookup) {
        const referencedObjectName =
          object.extraData.lookupObjectNameMapping.get(field) || fieldDescribe.referenceTo?.[0];
        object.extraData.lookupObjectNameMapping.set(field, referencedObjectName as string);

        if (referencedObjectName === fieldDescribe.referenceTo?.[0] && fieldDescribe.isMasterDetail) {
          object.extraData.masterDetailObjectNameMapping.set(field, referencedObjectName as string);
        }

        // Exclude the field if the referenced object is in the excluded objects list
        if (objectSet.excludedObjects.includes(referencedObjectName as string)) {
          this.comUtils.logCommandMessage(
            'process.skipping-lookup-field-referenced-object-excluded',
            objectSet.index.toString(),
            object.extraData.objectName,
            field,
            referencedObjectName as string
          );
          return false;
        }
      }

      // Validate that all external ID fields exist in the metadata
      object.externalId
        .split(Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR)
        .forEach((externalIdField) => {
          let externalIdCField = externalIdField;
          if (DataMoveUtilsStatic.isRField(externalIdCField)) {
            externalIdCField = externalIdCField.split('.')[0];
            externalIdCField = DataMoveUtilsStatic.getCField(externalIdCField);
          }
          const externalIdFieldDescribe = objectDescribe.fieldsMap.get(externalIdCField) as SObjectFieldDescribe;
          if (!externalIdFieldDescribe) {
            this.comUtils.throwCommandError(
              'error.external-id-field-not-found-in-metadata',
              objectSet.index.toString(),
              object.extraData.objectName,
              externalIdCField
            );
          }
        });

      return true;
    });
  }

  /**
   * Creates a new referenced object and adds it to the object set.
   *
   * @param referencingObjectName The name of the object that references the new object.
   * @param referencedObjectName The name of the new object to create.
   * @param objectSet The object set to add the new object to.
   * @returns A promise that resolves to the newly created object.
   */
  public async createObjectAsync(
    referencingObjectName: string,
    referencedObjectName: string,
    objectSet: ScriptObjectSet
  ): Promise<ScriptObject> {
    // Log the creation of a new referenced object
    this.comUtils.logCommandMessage(
      'process.added-new-referenced-object',
      objectSet.index.toString(),
      referencingObjectName,
      referencedObjectName
    );

    // Create a query to select the Id from the referenced object
    const query = `SELECT Id FROM ${referencedObjectName}`;
    const object = new ScriptObject({
      query,
      operation: OPERATION.Readonly,
      externalId: undefined,
      master: false,
    });
    // Add the new object to the object set
    objectSet.objects.push(object);

    // Process the newly created object
    await this.prepareObjectDataAsync(object, objectSet);

    return object;
  }

  /**
   *  Removes a field from the extra data object.
   * @param extraData  Extra data object to remove the field from
   * @param field  Field to remove
   */
  // eslint-disable-next-line class-methods-use-this
  public removeFieldFromObject(object: ScriptObject, field: string): void {
    object.extraData.fields = object.extraData.fields.filter((f) => f !== field);
    object.extraData.lookupObjectNameMapping.delete(field);
    object.extraData.lookupObjectMapping.delete(field);
    object.extraData.sourceToTargetFieldMapping.delete(field);
  }

  /**
   * Post-processes an object after initial processing.
   *
   * @param object The object to post-process.
   */
  public finalizeObject(object: ScriptObject): void {
    // Retrieve the source object's description
    const objectDescribe = this.sourceSObjectDescribeMap.get(object.extraData.objectName) as SObjectDescribe;

    // Ensure fields are distinct ****************************************************
    object.extraData.fields = Utils.distinctStringArray(object.extraData.fields);

    // Processing and mapping object dependencies ************************************
    // Iterate over each field to handle reference mappings
    this.comUtils.logCommandMessage(
      'process.processing-object-dependencies',
      object.objectSet.index.toString(),
      object.extraData.objectName
    );

    for (const field of object.extraData.fields) {
      // Skip reference fields as they are handled separately
      if (DataMoveUtilsStatic.isRField(field)) {
        continue;
      }

      // Retrieve the field's description
      const fieldDescribe = objectDescribe.fieldsMap.get(field) as SObjectFieldDescribe;

      // Handle lookup fields by setting up reference mappings
      if (fieldDescribe.isLookup) {
        const referencedObjectName = object.extraData.lookupObjectNameMapping.get(field);
        const referencedObject = object.objectSet.objects.find(
          (obj) => obj.extraData.objectName === referencedObjectName
        ) as ScriptObject;

        // Check whether the referenced object has Delete operation
        if (referencedObject.operation === OPERATION.Delete) {
          this.comUtils.throwCommandError(
            'error.lookup-field-referenced-object-delete-operation',
            object.objectSet.index.toString(),
            object.extraData.objectName,
            field,
            referencedObjectName as string
          );
        }

        // Map the reference object
        object.extraData.lookupObjectMapping.set(field, referencedObject);
      }
    }

    // Ensure fields are distinct ****************************************************
    object.extraData.fields = Utils.distinctStringArray(object.extraData.fields);

    // Map fields and query parts to their target counterparts ************************
    this.comUtils.logCommandMessage(
      'process.mapping-object-fields',
      object.objectSet.index.toString(),
      object.extraData.objectName
    );

    // Map each field to its target counterpart
    object.extraData.fields.forEach((field) => {
      object.extraData.sourceToTargetFieldMapping.set(
        field !== 'Id' ? field : Constants.DATA_MOVE_CONSTANTS.FIELD_MAPPING_ID_FIELD,
        DataMoveUtilsStatic.mapField(field, object)
      );
    });

    // Determine the target external ID based on whether it's missing or not
    if (!object.extraData.isExternalIdMissing || object.extraData.objectName === object.extraData.targetObjectName) {
      // When the external id is present in the configuration, or the source and target is the same object, just map the source external id to the target
      object.extraData.targetExternalId = DataMoveUtilsStatic.mapExternalId(object.externalId, object);
    } else if (object.extraData.isExternalIdMissing) {
      // When the external id is autogenerated, create a default external id based on the target object's metadata
      object.extraData.targetExternalId = this.getDefaultExternalId(object.extraData.targetObjectName, true);
      const externalIdParts = object.externalId.split(Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR);
      const targetExternalIdParts = object.extraData.targetExternalId.split(
        Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR
      );
      externalIdParts.forEach((part, index) => {
        object.extraData.sourceToTargetFieldMapping.set(part, targetExternalIdParts[index]);
      });
    }

    // Map the WHERE clause to its target counterpart
    object.extraData.targetWhere = DataMoveUtilsStatic.mapWhereClause(object.extraData.where, object);

    /**
     * Recursively checks if the object has any references to a master object.
     * @param obj The object to check for references.
     * @param visitedObjects The set of objects visited in the current traversal path to detect cycles.
     * @param isFirstChildLevel A boolean indicating whether the current recursion is at the first child level.
     * @returns A boolean indicating whether the object has any references to a master object.
     */
    const _hasReferenceMasterObjectRecursive = (
      obj: ScriptObject,
      visitedObjects: Set<string>,
      isFirstChildLevel: boolean
    ): boolean => {
      const objectName = obj.extraData.objectName;

      // If the object is already in the current path, a cycle is detected
      if (visitedObjects.has(objectName)) {
        return false; // Avoid infinite loops due to cycles
      }

      // Add the current object to the path
      visitedObjects.add(objectName);

      // Get the list of objects in the same object set
      const allObjects = obj.objectSet.objects;

      // First, check the parent objects that this object references
      for (const parentObjectName of obj.extraData.lookupObjectNameMapping.values()) {
        const parentObject = allObjects.find((o) => o.extraData.objectName === parentObjectName);
        if (!parentObject) {
          continue; // Parent object not found in the object set
        }
        if (parentObject.master === true) {
          return true;
        }
        // Create a new visitedObjects set only once per path at the second level
        const nextVisitedObjects = isFirstChildLevel ? new Set(visitedObjects) : visitedObjects;
        if (_hasReferenceMasterObjectRecursive(parentObject, nextVisitedObjects, false)) {
          return true;
        }
      }

      // Now, check if any other objects reference this object
      for (const otherObject of allObjects) {
        const otherObjectName = otherObject.extraData.objectName;
        if (otherObjectName === objectName) {
          continue; // Skip self
        }
        // Check if otherObject references this object
        const referencesThisObject = Array.from(otherObject.extraData.lookupObjectNameMapping.values()).includes(
          objectName
        );
        if (referencesThisObject) {
          if (otherObject.master === true) {
            return true;
          }
          // Create a new visitedObjects set only once per path at the second level
          const nextVisitedObjects = isFirstChildLevel ? new Set(visitedObjects) : visitedObjects;
          if (_hasReferenceMasterObjectRecursive(otherObject, nextVisitedObjects, false)) {
            return true;
          }
        }
      }

      // No master object found in the references
      return false;
    };

    /**
     * Checks if the object has any references to a master object.
     * @param obj The object to check for references.
     * @returns A boolean indicating whether the object has any references to a master object.
     */
    const hasReferenceMasterObject = (obj: ScriptObject): boolean => {
      // If the object is master, we can return false
      if (obj.master === true) {
        return false;
      }
      // Start with an empty set for the current path and set isFirstChildLevel to true
      return _hasReferenceMasterObjectRecursive(obj, new Set<string>(), true);
    };

    // Check if the object has any references
    const isReferencedToMaster = hasReferenceMasterObject(object);
    if (!object.master && !isReferencedToMaster) {
      this.comUtils.logCommandMessage(
        'process.object-set-to-master',
        object.objectSet.index.toString(),
        object.extraData.objectName,
        object.extraData.objectName
      );
      object.master = true;
    }
  }

  /**
   *  Creates a callback function to log the query job information.
   * @param info  The query job information to log.
   */
  public getQueryProgressCallback(object: ScriptObject, useSourceConnection?: boolean): (info: QueryJobInfo) => void {
    return (info: QueryJobInfo): void => {
      const label = useSourceConnection ? this.command.sourceConnectionLabel : this.command.targetConnectionLabel;
      const objectName = useSourceConnection ? object.extraData.objectName : object.extraData.targetObjectName;
      this.comUtils.logCommandMessage(
        'progress.querying-records-progress',
        object.objectSet.index.toString(),
        objectName,
        label,
        info.engine,
        info.filteredRecordCount.toString()
      );
    };
  }

  /**
   *  Creates a callback function to log the update job information.
   * @param info  The update job information to log.
   */
  public getUpdateProgressCallback(object: ScriptObject, useSourceConnection?: boolean): (info: IngestJobInfo) => void {
    return (info: IngestJobInfo): void => {
      const label = useSourceConnection ? this.command.sourceConnectionLabel : this.command.targetConnectionLabel;
      const objectName = useSourceConnection ? object.extraData.objectName : object.extraData.targetObjectName;
      this.comUtils.logCommandMessage(
        'progress.updating-records-progress',
        object.objectSet.index.toString(),
        objectName,
        label,
        info.engine as any,
        info.operation as any,
        !info.jobId ? 'No bulk job' : info.jobId,
        info.state,
        info.numberRecordsProcessed.toString(),
        info.numberRecordsFailed.toString()
      );
    };
  }

  /**
   * Creates a callback function to call on each record when querying records.
   * @param object  The object to apply the callback to.
   * @param useSourceConnection  Whether to use the source connection for mapping.
   * @returns   A callback function to call on each record when querying records.
   */
  // eslint-disable-next-line class-methods-use-this
  public getQueryRecordCallback(object: ScriptObject, useSourceConnection?: boolean): (rawRecord: any) => any {
    const externalIdFields = useSourceConnection
      ? object.externalId.split(Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR)
      : object.extraData.targetExternalId.split(Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR);
    const lookupFields = Array.from(object.extraData.lookupObjectNameMapping.keys());
    const polymorphicQueryFields = Array.from(object.extraData.polymorphicQueryFieldsMapping.keys());

    return (rawRecord: any): any => {
      // Map the polymorphic field to the correct field name if it exists +++++++++++++
      // i.e. 'What.Id' -> 'WhatId' for Task
      for (const polymorphicQueryField of polymorphicQueryFields) {
        if (Object.prototype.hasOwnProperty.call(rawRecord, polymorphicQueryField)) {
          const field = object.extraData.polymorphicQueryFieldsMapping.get(polymorphicQueryField) as string;
          rawRecord[field] = rawRecord[polymorphicQueryField];
          delete rawRecord[polymorphicQueryField];
        }
      }

      // Map record Id to external Id +++++++++++++++++++++++++++++++++++++++++++++++
      // Create a complex external Id by concatenating multiple fields
      // Check if this id is already in the mapping
      const externalId = externalIdFields
        .reduce((acc, field) => {
          acc.push(String(rawRecord[field] || 'NULL'));
          return acc;
        }, new Array<string>())
        .join(Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_VALUE_SEPARATOR);

      // Store the mapping of the record Id to the external Id
      if (useSourceConnection) {
        const isInMapping = object.extraData.sourceIdToExternalIdMapping.has(rawRecord.Id);
        if (isInMapping) {
          // Skip the record from writing in file if it's already in the mapping
          return null;
        }
        object.extraData.sourceIdToExternalIdMapping.set(rawRecord.Id, externalId);
      } else {
        const isInMapping = object.extraData.targetExternalIdToIdMapping.has(externalId);
        if (isInMapping) {
          // Skip the record from writing in file if it's already in the mapping
          return null;
        }
        object.extraData.targetExternalIdToIdMapping.set(externalId, rawRecord.Id);
      }

      // Map lookup fields to parent record ids +++++++++++++++++++++++++++++++++++
      for (let field of lookupFields) {
        if (!useSourceConnection) {
          field = object.extraData.sourceToTargetFieldMapping.get(field) as string;
        }
        const parentIdValue = rawRecord[field];
        if (!parentIdValue) {
          continue;
        }
        if (!object.extraData.lookupFieldToRecordIdSetMapping.has(field)) {
          object.extraData.lookupFieldToRecordIdSetMapping.set(field, new Set<string>());
        }
        object.extraData.lookupFieldToRecordIdSetMapping.get(field)?.add(parentIdValue);
      }

      // Returns the raw record as is
      return rawRecord;
    };
  }

  /**
   * Asynchronously creates export records by reading from a source CSV file,
   * transforming the records, and writing them to an export CSV file.
   *
   * @param object - The ScriptObject containing configuration and file information.
   * @param requiredOperation - The operation type for which records are being exported.
   * @param transformRecordsCallback - A callback function to transform each raw record.
   * @param useTargetFileAsSource - Optional flag to determine the source file (source vs. target).
   * @returns A Promise that resolves when the export process is complete.
   */
  // eslint-disable-next-line class-methods-use-this
  public async createExportRecordsAsync(
    object: ScriptObject,
    requiredOperation: OPERATION,
    transformRecordsCallback: (rawRecord: any) => any,
    useTargetFileAsSource?: boolean
  ): Promise<void> {
    // Determine the source file path based on the `useTargetFileAsSource` flag
    const sourceRecordsFilePath = !useTargetFileAsSource
      ? path.join(object.objectSet.sourceSubDirectory, object.getWorkingCSVFileName(object.operation, 'source'))
      : path.join(object.objectSet.targetSubDirectory, object.getWorkingCSVFileName(object.operation, 'target'));

    // Determine the export file path
    const exportRecordsFilePath = path.join(
      object.objectSet.exportSubDirectory,
      object.getWorkingCSVFileName(requiredOperation, 'export')
    );

    // Create the readable and writable streams
    const readStream = Utils.createCsvReadableFileStream(sourceRecordsFilePath, transformRecordsCallback);
    const writeStream = fs.createWriteStream(exportRecordsFilePath, {
      flags: 'w',
      encoding: Constants.DEFAULT_ENCODING,
      highWaterMark: Constants.DEFAULT_FILE_WRITE_STREAM_HIGH_WATER_MARK,
    });

    // Use pipeline to handle stream piping with proper error handling
    await pipelineAsync(readStream, writeStream);
  }

  // Process Helper methods -----------------------------------------------------------
  /**
   * Loads the script from the configuration file, sets up directories, and initializes object sets.
   *
   * @throws Will throw an error if the configuration file is not found.
   */
  public loadScript(): void {
    // Initialize command utilities
    const configPath = this.comUtils.getConfigFilePath();

    // Log the loading of the configuration file
    this.comUtils.logCommandMessage('process.loading-configuration-file', configPath);

    // Check if the configuration file exists
    if (fs.existsSync(configPath)) {
      // Parse and instantiate the script from the configuration file
      this.script = Utils.plainToCLass(Script, JSON.parse(fs.readFileSync(configPath, Constants.DEFAULT_ENCODING)));

      // If there are objects directly under script, wrap them in an object set
      if (this.script.objects.length > 0) {
        this.script.objectSets.unshift(new ScriptObjectSet({ objects: this.script.objects }));
        this.script.objects = [];
      }

      // Create necessary directories for configuration, source, target, and temporary files
      this.configDir = this.comUtils.createConfigDirectory() as string;
      this.sourceDir = this.comUtils.createConfigDirectory(
        Constants.DATA_MOVE_CONSTANTS.CSV_SOURCE_SUB_DIRECTORY,
        true
      ) as string;
      this.targetDir = this.comUtils.createConfigDirectory(
        Constants.DATA_MOVE_CONSTANTS.CSV_TARGET_SUB_DIRECTORY,
        true
      ) as string;
      this.tempDir = this.comUtils.createConfigDirectory(Constants.DATA_MOVE_CONSTANTS.TEMP_DIRECTORY, true) as string;

      // Filter out excluded objects from each object set
      this.script.objectSets.forEach((objectSet) => {
        if (!this.scriptSetParsedObjectQueryMap.has(objectSet)) {
          this.scriptSetParsedObjectQueryMap.set(objectSet, new Map<ScriptObject, ParsedQuery>());
        }
        const thisObjectSetNameMapping = this.scriptSetParsedObjectQueryMap.get(objectSet) as Map<
          ScriptObject,
          ParsedQuery
        >;
        objectSet.objects.forEach((object) => {
          thisObjectSetNameMapping.set(object, DataMoveUtilsStatic.parseQueryString(object.query, ParsedQuery));
        });
        objectSet.objects = objectSet.objects.filter((object) => {
          // Filter excluded objects
          if (object.excluded) {
            // Log exclusion of the object
            this.comUtils.logCommandMessage(
              'process.excluding-object',
              objectSet.index.toString(),
              thisObjectSetNameMapping.get(object)!.objectName
            );
            objectSet.excludedObjects.push(object.extraData.objectName);
            return false;
          }

          // Filter objects with duplicate object names
          if (
            objectSet.objects.some(
              (obj) =>
                obj !== object &&
                thisObjectSetNameMapping.get(obj)?.objectName === thisObjectSetNameMapping.get(object)?.objectName
            )
          ) {
            this.comUtils.logCommandMessage(
              'process.excluding-object-duplicate-object-name',
              objectSet.index.toString(),
              object.extraData.objectName
            );
            return false;
          }

          return true;
        });
      });

      // Remove any empty object sets
      this.script.objectSets = this.script.objectSets.filter((objectSet) => objectSet.objects.length > 0);

      // Assign index numbers to each object set and reference the script
      this.script.objectSets.forEach((objectSet, index) => {
        // Set the object set index and script reference
        objectSet.index = index + 1;
        objectSet.script = this.script;
        // Create source directory for CSV files
        objectSet.sourceSubDirectory = this.comUtils.createConfigDirectory(
          path.join(Constants.DATA_MOVE_CONSTANTS.CSV_SOURCE_SUB_DIRECTORY, objectSet.getTemporarySubDirectory())
        ) as string;
        // Create target directory for CSV files
        objectSet.targetSubDirectory = this.comUtils.createConfigDirectory(
          path.join(Constants.DATA_MOVE_CONSTANTS.CSV_TARGET_SUB_DIRECTORY, objectSet.getTemporarySubDirectory())
        ) as string;
        // Create export directory for CSV files
        objectSet.exportSubDirectory = this.comUtils.createConfigDirectory(
          path.join(Constants.DATA_MOVE_CONSTANTS.CSV_EXPORT_SUB_DIRECTORY, objectSet.getTemporarySubDirectory())
        ) as string;
      });
    } else {
      // Throw an error if the configuration file does not exist
      this.comUtils.throwError('error.config-file-not-found', configPath);
    }
  }

  /**
   *  Counts the total number of records for all objects in an object set.
   * @param objectSet  The object set to count records for.
   * @param useSourceConnection  Whether to use the source connection for counting records.
   */
  public async countObjectSetTotalRecordsAsync(
    objectSet: ScriptObjectSet,
    useSourceConnection: boolean
  ): Promise<void> {
    // Determine which connection label to use for logging
    const label = useSourceConnection ? this.command.sourceConnectionLabel : this.command.targetConnectionLabel;

    for (const object of objectSet.objects) {
      if (!useSourceConnection && (object.operation === OPERATION.Delete || object.deleteOldData)) {
        this.comUtils.logCommandMessage(
          'process.counting-total-records-for-delete',
          objectSet.index.toString(),
          object.extraData.deleteParsedQuery.objectName,
          label
        );
        const query = DataMoveUtilsStatic.composeQueryString(
          object.extraData.deleteParsedQuery,
          false,
          ['COUNT(Id) CNT'],
          !object.master
        );
        const result = await this.appUtils.queryRestToMemorySimpleAsync({
          query,
          useSourceConnection: false,
        });

        object.extraData.targetTotalRecordsToDelete = result?.[0]['CNT'] as number;

        this.comUtils.logCommandMessage(
          'process.total-records-delete-counted',
          objectSet.index.toString(),
          object.extraData.deleteParsedQuery.objectName,
          label,
          object.extraData.targetTotalRecordsToDelete.toString()
        );

        if (object.operation === OPERATION.Delete) {
          continue;
        }
      }

      // Log the total number of records for each object
      this.comUtils.logCommandMessage(
        'process.counting-total-records',
        objectSet.index.toString(),
        object.extraData.objectName,
        label
      );

      const query = DataMoveUtilsStatic.composeQueryString(
        object.extraData,
        useSourceConnection,
        ['COUNT(Id) CNT'],
        !object.master
      );

      const result = await this.appUtils.queryRestToMemorySimpleAsync({
        query,
        useSourceConnection,
      });

      if (useSourceConnection) {
        object.extraData.totalRecords = result?.[0]['CNT'] as number;
      } else {
        object.extraData.targetTotalRecords = result?.[0]['CNT'] as number;
        if (object.deleteOldData) {
          object.extraData.targetTotalRecords -= object.extraData.targetTotalRecordsToDelete;
        }
      }

      this.comUtils.logCommandMessage(
        'process.total-records-counted',
        objectSet.index.toString(),
        object.extraData.objectName,
        label,
        (useSourceConnection ? object.extraData.totalRecords : object.extraData.targetTotalRecords).toString()
      );
    }
  }

  /**
   * Delete objects records from the target org.
   * Applied to objects having `Delete` operation or `deleteOldData` property set to true.
   * @param objectSet  The object set to delete records for.
   */
  public async deleteObjectSetRecordsAsync(objectSet: ScriptObjectSet): Promise<void> {
    const isDeleteActionRequired = objectSet.objects.some(
      (obj) => (obj.operation === OPERATION.Delete || obj.deleteOldData) && obj.extraData.targetTotalRecordsToDelete > 0
    );
    if (!isDeleteActionRequired) {
      this.comUtils.logCommandMessage('process.no-objects-to-delete', objectSet.index.toString());
      return;
    }

    this.comUtils.logCommandMessage('process.deleting-records', objectSet.index.toString());

    for (const objectName of objectSet.deleteObjectsOrder) {
      const object = objectSet.objects.find((obj) => obj.extraData.objectName === objectName) as ScriptObject;

      if (object.operation === OPERATION.Delete || object.deleteOldData) {
        const deleteApiOperation: ApiOperation = object.hardDelete ? 'hardDelete' : 'delete';

        //  Create the name of the file to store the records to delete +++++++
        const targetRecordsFilePath = path.join(
          objectSet.targetSubDirectory,
          object.getWorkingCSVFileName(OPERATION.Delete, 'target')
        );
        const exportRecordsFilePath = path.join(
          objectSet.exportSubDirectory,
          object.getWorkingCSVFileName(OPERATION.Delete, 'export')
        );
        const exportStatusFilePath = path.join(
          objectSet.exportSubDirectory,
          object.getWorkingCSVFileName(OPERATION.Delete, 'export', true)
        );

        // Query records to delete +++++++
        // Determine the suggested query engine based on the total records to delete
        const suggestedQueryEngine = ApiUtils.suggestQueryEngine(
          object.extraData.targetTotalRecordsToDelete,
          object.extraData.targetTotalRecordsToDelete,
          1
        );

        // Skip the API call if the suggested query engine indicates to do so
        if (suggestedQueryEngine.skipApiCall) {
          // Create empty CSV file if no records to delete
          Utils.writeEmptyCsvFile(targetRecordsFilePath, object.extraData.deleteParsedQuery.fields);
          continue;
        }

        // Make the query to target records to delete
        const queryParams = {
          useSourceConnection: false,
          query: DataMoveUtilsStatic.composeQueryString(object.extraData.deleteParsedQuery),
          filePath: targetRecordsFilePath,
          columns: object.extraData.deleteParsedQuery.fields,
          progressCallback: this.getQueryProgressCallback(object),
        } as QueryAsyncParameters;

        if (suggestedQueryEngine.shouldUseBulkApi) {
          await this.appUtils.queryBulkToFileAsync(queryParams);
        } else {
          await this.appUtils.queryRestToFileAsync(queryParams);
        }

        // Transform records to delete +++++++
        await this.createExportRecordsAsync(object, OPERATION.Delete, (rawRecord: any): any => rawRecord, true);

        // Delete records +++++++
        const deleteParams = {
          operation: deleteApiOperation,
          useSourceConnection: false,
          sobjectType: object.extraData.deleteParsedQuery.objectName,
          filePath: exportRecordsFilePath,
          statusFilePath: exportStatusFilePath,
          progressCallback: this.getUpdateProgressCallback(object),
        } as UpdateAsyncParameters;

        const suggestedUpdateEngine = ApiUtils.suggestUpdateEngine(object.extraData.targetTotalRecordsToDelete);
        if (suggestedUpdateEngine.shouldUseBulkApi) {
          await this.appUtils.updateBulkFromFileAsync(deleteParams);
        } else {
          await this.appUtils.updateRestFromFileAsync(deleteParams);
        }

        // Log the deletion of records +++++++
        // Mark the object as completed when it is a delete operation. +++++++
        if (object.operation === OPERATION.Delete) {
          object.completed = true;
        }
      }
    }
  }

  /**
   * Query master objects from the source org.
   *
   * @param objectSet  The object set to query master objects for.
   * @param useSourceConnection  Whether to use the source connection for querying master objects.
   */
  public async queryObjectSetMasterObjectsAsync(
    objectSet: ScriptObjectSet,
    useSourceConnection?: boolean
  ): Promise<void> {
    for (const objectName of objectSet.updateObjectsOrder) {
      const object = objectSet.objects.find((obj) => obj.extraData.objectName === objectName) as ScriptObject;
      if (object.completed) {
        continue;
      }
      if (object.master) {
        const query = DataMoveUtilsStatic.composeQueryString(object.extraData, useSourceConnection);
        const filePath = useSourceConnection
          ? path.join(objectSet.sourceSubDirectory, object.getWorkingCSVFileName(object.operation, 'source'))
          : path.join(objectSet.targetSubDirectory, object.getWorkingCSVFileName(object.operation, 'target'));
        const columns = useSourceConnection
          ? object.extraData.fields
          : object.extraData.fields.map((field) => object.extraData.sourceToTargetFieldMapping.get(field));

        const queryParams = {
          useSourceConnection,
          query,
          filePath,
          columns,
          progressCallback: this.getQueryProgressCallback(object, useSourceConnection),
          recordCallback: this.getQueryRecordCallback(object, useSourceConnection),
        } as QueryAsyncParameters;

        const suggestedQueryEngine = ApiUtils.suggestQueryEngine(
          useSourceConnection ? object.extraData.totalRecords : object.extraData.targetTotalRecords,
          useSourceConnection ? object.extraData.totalRecords : object.extraData.targetTotalRecords,
          1
        );

        if (suggestedQueryEngine.skipApiCall) {
          // Creeate empty CSV file if no records to query
          Utils.writeEmptyCsvFile(queryParams.filePath!, queryParams.columns!);
          continue;
        }

        if (suggestedQueryEngine.shouldUseBulkApi) {
          await this.appUtils.queryBulkToFileAsync(queryParams);
        } else {
          await this.appUtils.queryRestToFileAsync(queryParams);
        }
      }
    }
  }

  /**
   *  Query child objects from the source org.
   * @param objectSet The object set to query child objects for.
   * @param isNewFile A map of file paths to a boolean indicating whether the file is new or new queried rows should be appended to the existing file.
   *
   * @example
   * - Retrieves object records by other objects referenced by this object (child records selection).
   *    For example, if this object is Account, then the query tempalte will be:
   *    `SELECT Id, Case__c FROM Account WHERE Case__c IN (SELECT Id FROM Case)`
   * - Retrieves object records by objects that reference this object (parent records selection).
   *    For example, if this object is Account, then the query tempalte will be:
   *    `SELECT Id FROM Account WHERE Id IN (SELECT AccountId FROM Case)`
   */
  public async queryObjectSetSourceChildObjectsAsync(
    objectSet: ScriptObjectSet,
    isNewFile: Map<string, boolean>
  ): Promise<void> {
    for (const objectName of objectSet.updateObjectsOrder) {
      const object = objectSet.objects.find((obj) => obj.extraData.objectName === objectName) as ScriptObject;

      if (object.completed) {
        continue;
      }

      if (!object.master) {
        const queryAllString = DataMoveUtilsStatic.composeQueryString(object.extraData, true);
        const baseQueryStringLength = DataMoveUtilsStatic.getSOQLStringLengthWOWhereClause(queryAllString);
        const queryParts = DataMoveUtilsStatic.splitSOQLStringWOWhereClause(queryAllString);
        const columns = object.extraData.fields;
        const filePath = path.join(
          objectSet.sourceSubDirectory,
          object.getWorkingCSVFileName(object.operation, 'source')
        );
        if (isNewFile.get(filePath) === undefined) {
          isNewFile.set(filePath, true);
        }

        // Query by objects referenced by this object (child records): +++++++++++++++++++++++++++++++++++++
        for (const field of object.extraData.lookupObjectMapping.keys()) {
          const referencedObject = object.extraData.lookupObjectMapping.get(field) as ScriptObject;
          const ids = Array.from(referencedObject.extraData.sourceIdToExternalIdMapping.keys());
          if (ids.length === 0) {
            continue;
          }
          const queries = DataMoveUtilsStatic.constructWhereInClause(
            field,
            ids,
            object.extraData.where,
            baseQueryStringLength
          );
          const suggestedQueryEngine = ApiUtils.suggestQueryEngine(
            object.extraData.totalRecords,
            ids.length,
            queries.length
          );

          for (const query of queries) {
            const finalQuery = (queryParts.beforeWhere + ' WHERE ' + query + ' ' + queryParts.afterWhere).trim();
            const queryParams = {
              useSourceConnection: true,
              appendToExistingFile: !isNewFile.get(filePath),
              query: finalQuery,
              filePath,
              columns,
              progressCallback: this.getQueryProgressCallback(object, true),
              recordCallback: this.getQueryRecordCallback(object, true),
            } as QueryAsyncParameters;
            if (suggestedQueryEngine.shouldUseBulkApi) {
              await this.appUtils.queryBulkToFileAsync(queryParams);
            } else {
              await this.appUtils.queryRestToFileAsync(queryParams);
            }
            isNewFile.set(filePath, false);
          }
        }

        // Query this object by objects that reference this object (parent records): ++++++++++++++++++++++++++++++++++++
        for (const referencingObject of objectSet.objects) {
          for (const field of referencingObject.extraData.lookupObjectMapping.keys()) {
            const thisObject = referencingObject.extraData.lookupObjectMapping.get(field) as ScriptObject;
            if (thisObject.extraData.objectName !== object.extraData.objectName) {
              continue;
            }
            const ids = Array.from(referencingObject.extraData.lookupFieldToRecordIdSetMapping.get(field) || []);
            if (ids.length === 0) {
              continue;
            }
            const queries = DataMoveUtilsStatic.constructWhereInClause(
              'Id',
              ids,
              object.extraData.where,
              baseQueryStringLength
            );
            const suggestedQueryEngine = ApiUtils.suggestQueryEngine(
              object.extraData.totalRecords,
              ids.length,
              queries.length
            );

            for (const query of queries) {
              const finalQuery = (queryParts.beforeWhere + ' WHERE ' + query + ' ' + queryParts.afterWhere).trim();
              const queryParams = {
                useSourceConnection: true,
                appendToExistingFile: !isNewFile.get(filePath),
                query: finalQuery,
                filePath,
                columns,
                progressCallback: this.getQueryProgressCallback(object, true),
                recordCallback: this.getQueryRecordCallback(object, true),
              } as QueryAsyncParameters;
              if (suggestedQueryEngine.shouldUseBulkApi) {
                await this.appUtils.queryBulkToFileAsync(queryParams);
              } else {
                await this.appUtils.queryRestToFileAsync(queryParams);
              }
              isNewFile.set(filePath, false);
            }
          }
        }
      }
    }
  }

  /**
   * Query child objects from the target org.
   * @example
   * If the object is  `Account`, and external Id is `Name`, then the query template is:
   * `SELECT Id, Name FROM Account:Target WHERE Name IN (SELECT Name FROM Account:Source)`
   * @param objectSet  The object set to query child objects for.
   */
  public async queryObjectSetTargetChildObjectsAsync(objectSet: ScriptObjectSet): Promise<void> {
    for (const objectName of objectSet.updateObjectsOrder) {
      const object = objectSet.objects.find((obj) => obj.extraData.objectName === objectName) as ScriptObject;

      if (object.completed) {
        continue;
      }

      if (!object.master) {
        const whereClauses = new Array<string>();
        const sourceExternalIdParts = object.externalId.split(
          Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR
        );
        const targetExternalIdParts = object.extraData.targetExternalId.split(
          Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR
        );
        const queryAllString = DataMoveUtilsStatic.composeQueryString(object.extraData);
        const baseQueryStringLength = DataMoveUtilsStatic.getSOQLStringLengthWOWhereClause(queryAllString);
        const queryParts = DataMoveUtilsStatic.splitSOQLStringWOWhereClause(queryAllString);
        const columns = object.extraData.fields.map((field) =>
          object.extraData.sourceToTargetFieldMapping.get(field)
        ) as string[];
        const filePath = path.join(
          objectSet.targetSubDirectory,
          object.getWorkingCSVFileName(object.operation, 'target')
        );
        const recordIdKeys = [...object.extraData.sourceIdToExternalIdMapping.keys()];
        for (const recordId of recordIdKeys) {
          const externalIdUsedSet = new Set<string>();
          const externalId = object.extraData.sourceIdToExternalIdMapping.get(recordId);
          if (!externalId || externalIdUsedSet.has(externalId)) {
            continue;
          }
          externalIdUsedSet.add(externalId);
          const externalIdValueParts = externalId.split(
            Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_VALUE_SEPARATOR
          );
          const whereClause = sourceExternalIdParts
            .map((part: any, index: number) => {
              let externalIdValue = externalIdValueParts[index];
              externalIdValue = DataMoveUtilsStatic.valueToSOQL(externalIdValue);
              return `${targetExternalIdParts[index]} = ${externalIdValue}`;
            })
            .filter((clause) => clause !== null)
            .join(' AND ');
          whereClauses.push(whereClause);
        }

        const queries = DataMoveUtilsStatic.constructWhereOrAndClause(
          'OR',
          whereClauses,
          object.extraData.targetWhere,
          baseQueryStringLength
        );
        const suggestedQueryEngine = ApiUtils.suggestQueryEngine(
          object.extraData.targetTotalRecords,
          recordIdKeys.length,
          queries.length
        );
        // TEST:
        if (object.extraData.targetObjectName === 'TestObject4__c') {
          this.command.info('TestObject4__c');
        }

        if (suggestedQueryEngine.shouldQueryAllRecords) {
          const queryParams = {
            useSourceConnection: false,
            query: queryAllString,
            filePath,
            columns,
            progressCallback: this.getQueryProgressCallback(object),
            recordCallback: this.getQueryRecordCallback(object),
          } as QueryAsyncParameters;
          if (suggestedQueryEngine.shouldUseBulkApi) {
            await this.appUtils.queryBulkToFileAsync(queryParams);
          } else {
            await this.appUtils.queryRestToFileAsync(queryParams);
          }
          continue;
        }

        for (const query of queries) {
          const finalQuery = (queryParts.beforeWhere + ' WHERE ' + query + ' ' + queryParts.afterWhere).trim();
          const queryParams = {
            useSourceConnection: false,
            query: finalQuery,
            filePath,
            columns,
            progressCallback: this.getQueryProgressCallback(object),
            recordCallback: this.getQueryRecordCallback(object),
          } as QueryAsyncParameters;
          if (suggestedQueryEngine.shouldUseBulkApi) {
            await this.appUtils.queryBulkToFileAsync(queryParams);
          } else {
            await this.appUtils.queryRestToFileAsync(queryParams);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  // Process methods --------------------------------------------------------------------------
  // ------------------------------------------------------------------------------------------
  /**
   *  Prepares the data move command by processing each object in each object set.
   *
   * @returns  A promise that resolves when the command is initialized.
   */
  public async prepareCommandAsync(): Promise<void> {
    // Load the script configurations ****************************************************
    this.loadScript();

    // Log the number of object sets being processed
    this.comUtils.logCommandMessage(
      'process.processing-object-set-configurations',
      this.script.objectSets.length.toString()
    );

    // Process each object in each object set **********************************************
    for (const objectSet of this.script.objectSets) {
      for (const object of objectSet.objects) {
        // Process the object asynchronously
        await this.prepareObjectDataAsync(object, objectSet);
      }
    }

    // Create referenced objects **********************************************************
    // Create any referenced objects that are not already present in the object sets
    for (const objectSet of this.script.objectSets) {
      for (const object of objectSet.objects) {
        const lookupFields = object.extraData.lookupObjectNameMapping.keys();
        for (const field of lookupFields) {
          const referencedObjectName = object.extraData.lookupObjectNameMapping.get(field) as string;
          if (!objectSet.objects.find((obj) => obj.extraData.objectName === referencedObjectName)) {
            // Create and process the referenced object asynchronously
            const duplicate = objectSet.objects.find((obj) => obj.extraData?.targetObjectName === referencedObjectName);
            if (duplicate) {
              this.comUtils.logCommandMessage(
                'process.skipping-lookup-field-referencing-mapped-object-not-in-object-set',
                objectSet.index.toString(),
                object.extraData.objectName,
                field,
                referencedObjectName,
                duplicate.extraData.objectName
              );
              // Remove the field from the lookup fields
              this.removeFieldFromObject(object, field);
            } else {
              await this.createObjectAsync(object.extraData.objectName, referencedObjectName, objectSet);
            }
          }
        }
      }
    }

    // Post-process each object in each object set ******************************************
    for (const objectSet of this.script.objectSets) {
      for (const object of objectSet.objects) {
        this.finalizeObject(object);
      }
    }
  }

  /**
   *  Creates the order of objects in which they should be processed.
   */
  public createProcessObjectOrder(objectSet: ScriptObjectSet): void {
    objectSet.updateObjectsOrder = objectSet.getObjectOrder();
    this.comUtils.logCommandMessage(
      'process.object-order-for-update',
      objectSet.index.toString(),
      objectSet.updateObjectsOrder.join(', ')
    );
    objectSet.deleteObjectsOrder = [...objectSet.updateObjectsOrder].reverse();
    this.comUtils.logCommandMessage(
      'process.object-order-for-delete',
      objectSet.index.toString(),
      objectSet.deleteObjectsOrder.join(', ')
    );
  }

  /**
   * Counts the total number of records to be processed for each object in each object set.
   */
  public async countTotalRecordsAsync(objectSet: ScriptObjectSet): Promise<void> {
    await this.countObjectSetTotalRecordsAsync(objectSet, true);
    await this.countObjectSetTotalRecordsAsync(objectSet, false);
  }

  /**
   * Processes the data move command by moving data from the source to the target.
   */
  public async executeCommandAsync(): Promise<void> {
    // Number of query attempts to query child objects to ebsure that all hierarchy is queried
    const MAX_CHILD_OBJECTS_QUERY_ATTEMPTS = 3;

    // ========================= Script scope: Common operations for all object sets ===========
    // Initialize and process the data move command asynchronously. +++++++++++++++++++++++++
    this.comUtils.logCommandMessage('process.prepare-command-stage');
    await this.prepareCommandAsync();

    // ========================= Object set scope: Operations for each object set ===============
    for (const objectSet of this.script.objectSets) {
      // Create the order which the objects should be processed per the object set. +++++++++
      this.comUtils.logCommandMessage('process.create-object-order-stage', objectSet.index.toString());
      this.createProcessObjectOrder(objectSet);

      // Count the total number of records to be processed. ++++++++++++++++++++++++++++++++++
      this.comUtils.logCommandMessage('process.count-total-records-stage', objectSet.index.toString());
      await this.countTotalRecordsAsync(objectSet);

      // Delete records from the target org. +++++++++++++++++++++++++++++++++++++++++++++++++
      this.comUtils.logCommandMessage('process.delete-records-stage', objectSet.index.toString());
      await this.deleteObjectSetRecordsAsync(objectSet);

      // Check whether there are any incomplete objects +++++++++++++++++++++++++++++++++++++
      const hasIncompleteObjects = objectSet.objects.some((obj) => !obj.completed);
      if (!hasIncompleteObjects) {
        // There are no incomplete objects, so skip the rest of the process...
        continue;
      }

      // Query master objects from the source org. ++++++++++++++++++++++++++++++++++++++++++++
      this.comUtils.logCommandMessage(
        'process.query-master-objects-stage',
        objectSet.index.toString(),
        this.command.sourceConnectionLabel
      );
      await this.queryObjectSetMasterObjectsAsync(objectSet, true);

      // Query master objects from the target org. +++++++++++++++++++++++++++++++++++++++++++++
      this.comUtils.logCommandMessage(
        'process.query-master-objects-stage',
        objectSet.index.toString(),
        this.command.targetConnectionLabel
      );
      await this.queryObjectSetMasterObjectsAsync(objectSet);

      // Query child objects from the source org. +++++++++++++++++++++++++++++++++++++++++++++++
      this.comUtils.logCommandMessage('process.query-source-child-objects-stage', objectSet.index.toString());
      const isNewFile = new Map<string, boolean>();
      for (let queryAttempt = 0; queryAttempt < MAX_CHILD_OBJECTS_QUERY_ATTEMPTS; queryAttempt++) {
        this.comUtils.logCommandMessage(
          'process.query-source-child-objects-attempt',
          objectSet.index.toString(),
          (queryAttempt + 1).toString()
        );
        await this.queryObjectSetSourceChildObjectsAsync(objectSet, isNewFile);
      }

      // Query child objects from the target org. +++++++++++++++++++++++++++++++++++++++++++++++++
      this.comUtils.logCommandMessage('process.query-target-child-objects-stage', objectSet.index.toString());
      await this.queryObjectSetTargetChildObjectsAsync(objectSet);
    }
  }
}
