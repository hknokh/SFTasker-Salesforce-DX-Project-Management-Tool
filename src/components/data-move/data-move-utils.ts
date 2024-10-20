import fs from 'node:fs';
import path from 'node:path';
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
    });
    // Add the new object to the object set
    objectSet.objects.push(object);

    // Process the newly created object
    await this.prepareObjectDataAsync(object, objectSet);

    return object;
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

        const rField = DataMoveUtilsStatic.getRField(field);
        const _rField = `${rField}.${referencedObject.externalId}`;

        // Set up bidirectional field mappings
        object.extraData.lookupFieldMapping.set(field, _rField);
        object.extraData.lookupFieldMapping.set(_rField, field);

        // Map the reference field to its parent object name
        object.extraData.lookupObjectNameMapping.set(_rField, referencedObjectName!);
        if (fieldDescribe.isMasterDetail) {
          object.extraData.masterDetailObjectNameMapping.set(_rField, referencedObjectName!);
        }

        // Map the reference object
        object.extraData.lookupObjectMapping.set(field, referencedObject);
        object.extraData.lookupObjectMapping.set(_rField, referencedObject);

        // Add the reference field to the fields list
        if (referencedObject.isComplexExternalId) {
          referencedObject.externalId
            .split(Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR)
            .forEach((extField) => {
              object.extraData.fields.push(`${rField}.${extField}`);
            });
        } else {
          object.extraData.fields.push(_rField);
        }
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
      object.extraData.sourceToTargetFieldMapping.set(field, DataMoveUtilsStatic.mapField(field, object));
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
  }

  /**
   *  Logs the query job information.
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
   *  Logs the ingest job information.
   * @param info  The ingest job information to log.
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
        Constants.DATA_MOVE_CONSTANTS.CSV_SOURCE_SUB_DIRECTORY
      ) as string;
      this.targetDir = this.comUtils.createConfigDirectory(
        Constants.DATA_MOVE_CONSTANTS.CSV_TARGET_SUB_DIRECTORY
      ) as string;
      this.tempDir = this.comUtils.createConfigDirectory(Constants.DATA_MOVE_CONSTANTS.TEMP_DIRECTORY) as string;

      // Filter out excluded objects from each object set
      this.script.objectSets.forEach((objectSet) => {
        objectSet.objects = objectSet.objects.filter((object) => {
          if (object.excluded) {
            // Log exclusion of the object
            this.comUtils.logCommandMessage(
              'process.excluding-object',
              objectSet.index.toString(),
              object.extraData.objectName
            );
            objectSet.excludedObjects.push(object.extraData.objectName);
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
        !useSourceConnection,
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
        const deletionRecordsFilePath = path.join(
          objectSet.targetSubDirectory,
          object.getWorkingCSVFileName(OPERATION.Delete, 'target')
        );
        const deletionStatusFilePath = path.join(
          objectSet.targetSubDirectory,
          object.getWorkingCSVFileName(OPERATION.Delete, 'target', true)
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
          Utils.writeEmptyCsvFile(deletionRecordsFilePath, object.extraData.deleteParsedQuery.fields);
          continue;
        }

        // Make the query to delete the records
        const queryParams = {
          useSourceConnection: false,
          query: DataMoveUtilsStatic.composeQueryString(object.extraData.deleteParsedQuery),
          filePath: deletionRecordsFilePath,
          columns: object.extraData.deleteParsedQuery.fields,
          progressCallback: this.getQueryProgressCallback(object),
        } as QueryAsyncParameters;

        if (suggestedQueryEngine.shouldUseBulkApi) {
          await this.appUtils.queryBulkToFileAsync(queryParams);
        } else {
          await this.appUtils.queryRestToFileAsync(queryParams);
        }

        // Delete records +++++++
        const deleteParams = {
          operation: deleteApiOperation,
          useSourceConnection: false,
          sobjectType: object.extraData.deleteParsedQuery.objectName,
          filePath: deletionRecordsFilePath,
          statusFilePath: deletionStatusFilePath,
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

  public async queryObjectSetSourceMasterObjectsAsync(objectSet: ScriptObjectSet): Promise<void> {
    for (const objectName of objectSet.updateObjectsOrder) {
      const object = objectSet.objects.find((obj) => obj.extraData.objectName === objectName) as ScriptObject;
      if (object.completed) {
        continue;
      }
      if (object.master) {
        const query = DataMoveUtilsStatic.composeQueryString(object.extraData, true);
        const queryParams = {
          useSourceConnection: true,
          query,
          filePath: path.join(objectSet.sourceSubDirectory, object.getWorkingCSVFileName(object.operation, 'source')),
          columns: object.extraData.fields,
          progressCallback: this.getQueryProgressCallback(object, true),
        } as QueryAsyncParameters;

        const suggestedQueryEngine = ApiUtils.suggestQueryEngine(
          object.extraData.totalRecords,
          object.extraData.totalRecords,
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
        const referencedObjects = object.extraData.lookupObjectNameMapping.values();
        for (const referencedObjectName of referencedObjects) {
          if (!objectSet.objects.find((obj) => obj.extraData.objectName === referencedObjectName)) {
            // Create and process the referenced object asynchronously
            await this.createObjectAsync(object.extraData.objectName, referencedObjectName, objectSet);
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
  public createProcessObjectOrder(): void {
    for (const objectSet of this.script.objectSets) {
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
  }

  /**
   * Counts the total number of records to be processed for each object in each object set.
   */
  public async countTotalRecordsAsync(): Promise<void> {
    for (const objectSet of this.script.objectSets) {
      await this.countObjectSetTotalRecordsAsync(objectSet, true);
      await this.countObjectSetTotalRecordsAsync(objectSet, false);
    }
  }

  /**
   * Processes the data move command by moving data from the source to the target.
   */
  public async processCommandAsync(): Promise<void> {
    // Process each object in each object set
    for (const objectSet of this.script.objectSets) {
      await this.deleteObjectSetRecordsAsync(objectSet);
      await this.queryObjectSetSourceMasterObjectsAsync(objectSet);
    }
  }
}
