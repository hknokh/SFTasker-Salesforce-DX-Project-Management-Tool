/* eslint-disable no-param-reassign */
import fs from 'node:fs';
import { CommandUtils } from '../command-utils.js';
import { Constants } from '../constants.js';
import { MetadataUtils } from '../metadata-utils.js';
import { SFtaskerCommand, SObjectDescribe, SObjectFieldDescribe } from '../models.js';
import { DataOriginType } from '../types.js';
import { Utils } from '../utils.js';
import ScriptMappingItem, { ParsedQuery, Script, ScriptObject, ScriptObjectSet } from './data-move-models.js';
import { OPERATION, ReferenceFieldData } from './data-move-types.js';

/**
 * Utility class for data-move command operations.
 */
export class DataMoveUtils<T> {
  public script!: Script;
  public objectSet!: ScriptObjectSet;

  public configDir!: string;
  public sourceDir!: string;
  public targetDir!: string;
  public tempDir!: string;

  public sourceSObjectDescribeMap: Map<string, SObjectDescribe> = new Map<string, SObjectDescribe>();
  public targetSObjectDescribeMap: Map<string, SObjectDescribe> = new Map<string, SObjectDescribe>();

  // Constructor ----------------------------------------------------------------
  /**
   *  Constructor for the data move utility class.
   * @param command  The command to process.
   */
  public constructor(private command: SFtaskerCommand<T>) {
    this.setupScript();
  }

  // Static methods ------------------------------------------------------------
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

  /**
   * Initial object setup
   * @param object  The object to setup
   * @param objectSet  The object set to which the object belongs
   */
  public initObject(object: ScriptObject, objectSet: ScriptObjectSet): void {
    if (this.command.targetDataOriginType !== DataOriginType.org || !object.useFieldMapping) {
      // Delete the field mapping if the target is a file,
      // because we write the same column names as the source.
      // The same when the field mapping is not used.
      object.fieldMapping = [];
    }
    // Assign the object set to the object
    object.objectSet = objectSet;
    // Parse the query string
    object.parsedQuery = DataMoveUtils.parseQueryString(object.query);
    object.parsedQuery.fieldMapping = new Map<string, string>();
    // Initialize the field mapping
    object.targetParsedQuery = Utils.deepClone(object.parsedQuery);
    object.targetParsedQuery.fieldMapping = new Map<string, string>();
    // Set the target object name if it's mapped
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    object.targetParsedQuery.objectName =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      object.fieldMapping.find((mapping) => mapping.targetObject)?.targetObject || object.parsedQuery.objectName;
  }

  /**
   * Sets up the object.
   * @param object  The object to setup
   */
  public setupObject(object: ScriptObject): void {
    const comUtils = new CommandUtils(this.command);

    comUtils.logCommandMessage(
      'process.setting-up-object',
      object.objectSet.index.toString(),
      object.parsedQuery.objectName
    );

    // Set the external id if not present
    if (!object.externalId) {
      if (this.command.sourceDataOriginType === DataOriginType.org) {
        // Prefer the default external id from the source org
        object.externalId = this.getDefaultExternalId(object.parsedQuery.objectName, true);
      } else if (object.fieldMapping.length === 0) {
        // If the source is a file, use the default external id from the target org
        object.externalId = this.getDefaultExternalId(object.parsedQuery.objectName, false);
      } else {
        // if the source is a file and field mapping is used, we use only constant default external id
        object.externalId = this.getDefaultExternalId(object.parsedQuery.objectName, false, true);
      }
      comUtils.logCommandMessage(
        'process.setting-default-external-id',
        object.objectSet.index.toString(),
        object.parsedQuery.objectName,
        object.externalId
      );
    }

    // Always use Id as external id for insert operations
    if (object.operation === OPERATION.Insert) {
      object.externalId = 'Id';
    }

    // Include external id fields in the query fields
    if (object.externalId) {
      object.externalId.split(Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR).forEach((field) => {
        if (!object.parsedQuery.fields.includes(field)) {
          object.parsedQuery.fields.push(field);
        }
      });
    }

    // Replace multiselect keywords with the actual fields
    this.applyMultiselectFields(object);

    // Include the Id field in the query fields if not present
    if (!object.parsedQuery.fields.includes('Id')) {
      object.parsedQuery.fields.unshift('Id');
    }

    // Filter out excluded fields
    object.parsedQuery.fields = object.parsedQuery.fields.filter((field) => {
      let excluded = Constants.DATA_MOVE_CONSTANTS.EXCLUDED_FIELDS.get(object.parsedQuery.objectName)?.includes(field); // Exclude uneligible fields
      excluded ||= object.excludedFields?.includes(field); // Exclude fields marked as excluded
      return !excluded;
    });

    // Make query fields unique
    object.parsedQuery.fields = Utils.distinctStringArray(object.parsedQuery.fields);

    // Setup field mapping
    this.setupFieldMapping(object);

    // Verify object fields metadata against source and target orgs
    this.verifyObjectFieldsMetadata(object);
  }

  // Instance methods ----------------------------------------------------------
  /**
   *  Sets up the script object.
   */
  public setupScript(): void {
    const comUtils = new CommandUtils(this.command);

    // Load the script from the config file
    const configPath = comUtils.getConfigFilePath();
    comUtils.logCommandMessage('process.loading-configuration-file', configPath);

    if (fs.existsSync(configPath)) {
      this.script = Utils.plainToCLass(Script, JSON.parse(fs.readFileSync(configPath, 'utf8')));
      if (this.script.objects.length > 0) {
        this.script.objectSets.unshift(new ScriptObjectSet({ objects: this.script.objects }));
        this.script.objects = [];
      }

      this.configDir = comUtils.createConfigDirectory() as string;
      this.sourceDir = comUtils.createConfigDirectory(Constants.DATA_MOVE_CONSTANTS.CSV_SOURCE_SUB_DIRECTORY) as string;
      this.targetDir = comUtils.createConfigDirectory(Constants.DATA_MOVE_CONSTANTS.CSV_TARGET_SUB_DIRECTORY) as string;
      this.tempDir = comUtils.createConfigDirectory(Constants.DATA_MOVE_CONSTANTS.TEMP_DIRECTORY) as string;

      // Setup the script objects
      this.script.objectSets.forEach((objectSet, index) => {
        // Assign the index witin the script to the object set.
        // The indexing is 1-based.
        objectSet.index = index + 1;

        // Remove excluded objects of this object set
        objectSet.objects = objectSet.objects.filter((object) => {
          if (object.excluded) {
            comUtils.logCommandMessage(
              'process.excluding-object',
              objectSet.index.toString(),
              object.parsedQuery.objectName
            );
            return false;
          }
          return true;
        });

        // Setup the script objects for this object set
        objectSet.objects.forEach((object) => {
          this.initObject(object, objectSet);
        });

        // Setup the polymorphic field mapping for this object set
        objectSet.objects.forEach((mappedObject) => {
          if (mappedObject.parsedQuery.objectName !== mappedObject.targetParsedQuery.objectName) {
            mappedObject.objectSet.objects.forEach((thisObject) => {
              thisObject.targetParsedQuery.polymorphicFieldMapping.forEach(
                (polymorphicObjectName, polymorphicField) => {
                  if (polymorphicObjectName === mappedObject.parsedQuery.objectName) {
                    thisObject.targetParsedQuery.polymorphicFieldMapping.set(
                      polymorphicField,
                      mappedObject.targetParsedQuery.objectName
                    );
                  }
                }
              );
            });
          }
        });
      });
    } else {
      comUtils.throwError('error.config-file-not-found', configPath);
    }
  }

  public async setupAllObjectSetsAsync(): Promise<void> {
    // Process the object sets in the script
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < this.script.objectSets.length; i++) {
      const objectSet = this.script.objectSets[i];
      this.objectSet = objectSet;
      // eslint-disable-next-line no-await-in-loop
      await this.setupObjectSetAsync(objectSet);
    }
  }

  public async setupObjectSetAsync(objectSet: ScriptObjectSet): Promise<void> {
    const comUtils = new CommandUtils(this.command);

    comUtils.logCommandMessage('process.setting-up-object-set', objectSet.index.toString());

    // Process the objects in the object set
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < objectSet.objects.length; i++) {
      const object = objectSet.objects[i];

      // Describe the object
      // eslint-disable-next-line no-await-in-loop
      await this.describeObjectAsync(object);

      // Setup the object
      this.setupObject(object);

      // Process lookup fields
      // eslint-disable-next-line no-await-in-loop
      await this.processingObjectLookupFieldsAsync(object);
    }

    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < objectSet.objects.length; i++) {
      const object = objectSet.objects[i];
      // Process object dependencies.
      // Adding parent lookup reference fields on child object to the child object query, for example:
      // Case.Account__c => Case.Account__r.Name
      this.processingObjectDependencies(object);
    }
  }

  /**
   *  Describes the given object against the source and target orgs.
   * @param object  The object to describe.
   * @returns
   */
  public async describeObjectAsync(object: ScriptObject): Promise<void> {
    const metaUtils = new MetadataUtils(this.command, this.tempDir);
    const comUtils = new CommandUtils(this.command);

    // Describibg the source object
    // eslint-disable-next-line eqeqeq
    if (this.command.sourceDataOriginType === DataOriginType.org) {
      if (!this.sourceSObjectDescribeMap.has(object.parsedQuery.objectName)) {
        comUtils.logCommandMessage(
          'process.describing-object',
          object.objectSet.index.toString(),
          object.parsedQuery.objectName,
          this.command.sourceConnectionLabel
        );
        // eslint-disable-next-line no-await-in-loop
        const sourceDescribe = (await metaUtils.getSObjectMetadataAsync(
          object.parsedQuery.objectName,
          true
        )) as SObjectDescribe;
        object.sourceDescribe = sourceDescribe;
        this.sourceSObjectDescribeMap.set(object.parsedQuery.objectName, sourceDescribe);
        if (this.command.targetDataOriginType !== DataOriginType.org) {
          this.targetSObjectDescribeMap.set(object.parsedQuery.objectName, sourceDescribe);
          object.targetDescribe = sourceDescribe;
        }
      }
    }

    // Describing the target object
    // eslint-disable-next-line eqeqeq
    if (this.command.targetDataOriginType === DataOriginType.org) {
      if (!this.targetSObjectDescribeMap.has(object.targetParsedQuery.objectName)) {
        comUtils.logCommandMessage(
          'process.describing-object',
          object.objectSet.index.toString(),
          object.parsedQuery.objectName,
          this.command.targetConnectionLabel
        );
        // eslint-disable-next-line no-await-in-loop
        const targetDescribe = (await metaUtils.getSObjectMetadataAsync(
          object.targetParsedQuery.objectName,
          false
        )) as SObjectDescribe;
        object.targetDescribe = targetDescribe;
        this.targetSObjectDescribeMap.set(object.targetParsedQuery.objectName, targetDescribe);
        if (this.command.sourceDataOriginType !== DataOriginType.org) {
          // Note! The source describe will NOT be in the describe map if field mapping is used
          this.sourceSObjectDescribeMap.set(object.targetParsedQuery.objectName, targetDescribe);
          object.sourceDescribe = targetDescribe;
        }
      }
    }
  }

  /**
   *  Sets up the field mapping for the given object.
   * @param object  The object to setup its field mapping.
   */
  public setupFieldMapping(object: ScriptObject): void {
    // Helper function to map the field
    const mapField = (field: string, mapping: ScriptMappingItem): string => {
      if (!DataMoveUtils.isRField(field)) {
        const targetField = field === mapping.sourceField ? mapping.targetField : field;
        if (targetField !== field) {
          object.externalId = object.externalId.replace(field, targetField);
        }
        return targetField;
      }
      const parts = field.split('.');
      const cField = DataMoveUtils.getCField(parts[0]);
      if (cField !== mapping.sourceField) {
        return field;
      }
      const targetRField = DataMoveUtils.getRField(mapping.targetField);
      object.externalId = object.externalId.replace(parts[0], targetRField);
      return `${targetRField}.${parts.slice(1).join('.')}`;
    };

    const comUtils = new CommandUtils(this.command);

    // Setup the field mapping
    if (object.fieldMapping.length > 0) {
      comUtils.logCommandMessage(
        'process.mapping-fields',
        object.objectSet.index.toString(),
        object.parsedQuery.objectName
      );

      object.parsedQuery.externalId = object.externalId;
      object.targetParsedQuery.externalId = object.externalId;

      object.fieldMapping.forEach((mapping) => {
        // Map the fields (object name is already mapped).
        if (mapping.sourceField && mapping.targetField) {
          // Replace the source field with the target field in the fields
          object.targetParsedQuery.fields = object.targetParsedQuery.fields.map((field) => {
            const mappedField = mapField(field, mapping);
            return mappedField;
          });
          // Set the Map for the direct field mapping
          object.targetParsedQuery.fieldMapping.set(mapping.targetField, mapping.sourceField);
          object.parsedQuery.fieldMapping.set(mapping.sourceField, mapping.targetField);
          // Replace the source field with the target field in the where clause, considering the reference fields
          const targetRField = DataMoveUtils.getRField(mapping.targetField);
          const sourceRField = DataMoveUtils.getRField(mapping.sourceField);
          object.targetParsedQuery.where = object.targetParsedQuery.where.replace(sourceRField, targetRField);
          // Replace the source field with the target field in the where clause, considering the direct fields
          object.targetParsedQuery.where = object.targetParsedQuery.where.replace(
            mapping.sourceField,
            mapping.targetField
          );
        }
      });
    }
  }

  /**
   *  Verifies the object fields against the source and target orgs.
   * @param object  The object to verify its fields
   */
  public verifyObjectFieldsMetadata(object: ScriptObject): void {
    const comUtils = new CommandUtils(this.command);

    comUtils.logCommandMessage(
      'process.verifying-query-fields',
      object.objectSet.index.toString(),
      object.parsedQuery.objectName
    );

    // Verify fields against source describe. Remove fields which are not present in the source describe
    if (this.command.sourceDataOriginType === DataOriginType.org) {
      object.parsedQuery.fields = object.parsedQuery.fields.filter((sourceField) => {
        const originalSourceField = sourceField;
        if (DataMoveUtils.isRField(sourceField)) {
          // If the field is a reference field, like Account__r.Name, we need to check the base field, like Account__c
          sourceField = DataMoveUtils.getCField(sourceField.split('.')[0]);
        }
        const fieldDescribe = object.sourceDescribe.fields.find((f) => f.name === sourceField);
        // __r fields can come from complex external id fields
        // We don't need to check them in the source describe
        if (!fieldDescribe) {
          if (
            object.externalId
              .split(Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR)
              .includes(originalSourceField)
          ) {
            // This field is a part of the external id, we cant remove it, throw an error
            comUtils.throwCommandError(
              'error.complex-external-id-field-not-found-in-metadata',
              object.objectSet.index.toString(),
              object.parsedQuery.objectName,
              this.command.sourceConnectionLabel,
              sourceField,
              object.externalId
            );
          }
          comUtils.logCommandMessage(
            'process.field-not-found-in-describe',
            object.objectSet.index.toString(),
            object.parsedQuery.objectName,
            this.command.sourceConnectionLabel,
            sourceField
          );
          object.parsedQuery.fields = object.parsedQuery.fields.filter((f) => f !== sourceField);
          // Get tartet mapped field
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const targetField = object.parsedQuery.fieldMapping.get(sourceField) || sourceField;
          // Remove target field from the target field list
          object.targetParsedQuery.fields = object.targetParsedQuery.fields.filter((f) => f !== targetField);
          // Remove the field mapping
          object.parsedQuery.fieldMapping.delete(sourceField);
        }
        return !!fieldDescribe;
      });
    }

    // Verify fields against target describe. Remove fields which are not present in the target describe
    if (this.command.targetDataOriginType === DataOriginType.org) {
      object.targetParsedQuery.fields = object.targetParsedQuery.fields.filter((targetField) => {
        const originalTargetField = targetField;
        if (DataMoveUtils.isRField(targetField)) {
          // If the field is a reference field, like Account__r.Name, we need to check the base field, like Account__c
          targetField = DataMoveUtils.getCField(targetField.split('.')[0]);
        }
        const fieldDescribe = object.targetDescribe.fields.find((f) => f.name === targetField);
        // We don't need to check __r fields in the target describe
        if (!fieldDescribe) {
          if (
            object.externalId
              .split(Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR)
              .includes(originalTargetField)
          ) {
            // This field is a part of the external id, we cant remove it, throw an error
            comUtils.throwCommandError(
              'error.complex-external-id-field-not-found-in-metadata',
              object.objectSet.index.toString(),
              object.parsedQuery.objectName,
              this.command.targetConnectionLabel,
              targetField,
              object.externalId
            );
          }
          comUtils.logCommandMessage(
            'process.field-not-found-in-describe',
            object.objectSet.index.toString(),
            object.targetParsedQuery.objectName,
            this.command.targetConnectionLabel,
            targetField
          );
          object.targetParsedQuery.fields = object.targetParsedQuery.fields.filter((f) => f !== targetField);
          // Get source mapped field
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const sourceField = object.targetParsedQuery.fieldMapping.get(targetField) || targetField;
          // Remove source field from the source field list
          object.parsedQuery.fields = object.parsedQuery.fields.filter((f) => f !== sourceField);
          // Remove the field mapping
          object.targetParsedQuery.fieldMapping.delete(targetField);
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        } else if (fieldDescribe && (fieldDescribe.readonly || object.excludedFromUpdateFields.includes(targetField))) {
          object.targetParsedQuery.excludedFromUpdateFields.push(targetField);
        }
        return !!fieldDescribe;
      });
    }
  }

  /**
   *  Processes the object lookup fields.
   * @param object  The object to process its lookup fields.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  public async processingObjectLookupFieldsAsync(object: ScriptObject): Promise<void> {
    const comUtils = new CommandUtils(this.command);

    comUtils.logCommandMessage(
      'process.processing-lookup-fields',
      object.objectSet.index.toString(),
      object.parsedQuery.objectName
    );

    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < object.parsedQuery.fields.length; i++) {
      const sourceField = object.parsedQuery.fields[i];
      const describe = object.sourceDescribe.fieldsMap.get(sourceField) as SObjectFieldDescribe;
      if (describe && describe.isLookup) {
        // Setup source lookup field
        const referencedObjectName =
          object.parsedQuery.polymorphicFieldMapping.get(sourceField) ?? describe.referenceTo?.[0];
        const referencedObject = object.objectSet.objects.find(
          (obj) => obj.parsedQuery.objectName === referencedObjectName
        );
        if (!referencedObject) {
          // eslint-disable-next-line no-await-in-loop
          await this.addReferencedObjectAsync(object, referencedObjectName as string, true);
        }
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const targetField = object.parsedQuery.fieldMapping.get(sourceField) || sourceField;
        const targetDescribe = object.targetDescribe.fieldsMap.get(targetField) as SObjectFieldDescribe;
        // Setup target lookup field
        if (targetDescribe.isLookup) {
          const targetReferencedObjectName =
            object.targetParsedQuery.polymorphicFieldMapping.get(targetField) ?? targetDescribe.referenceTo?.[0];
          const targetReferencedObject = object.objectSet.objects.find(
            (obj) => obj.targetParsedQuery.objectName === targetReferencedObjectName
          );
          if (!targetReferencedObject) {
            // eslint-disable-next-line no-await-in-loop
            await this.addReferencedObjectAsync(object, targetReferencedObjectName as string, false);
          }
        }
      }
    }
  }

  /**
   * Processes the object dependencies.
   * Adding nesessary parent lookup reference fields on child object to the child object query.
   * Creating necessary mapping fields for the parent lookup reference fields.
   * @param object  The object to process its dependencies.
   */
  public processingObjectDependencies(object: ScriptObject): void {
    const comUtils = new CommandUtils(this.command);

    comUtils.logCommandMessage(
      'process.processing-object-dependencies',
      object.objectSet.index.toString(),
      object.parsedQuery.objectName
    );

    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < object.parsedQuery.fields.length; i++) {
      const sourceField = object.parsedQuery.fields[i];
      const describe = object.sourceDescribe.fieldsMap.get(sourceField) as SObjectFieldDescribe;

      if (describe && describe.isLookup) {
        const referencedObjectName =
          object.parsedQuery.polymorphicFieldMapping.get(sourceField) ?? describe.referenceTo?.[0];
        const referencedObject = object.objectSet.objects.find(
          (obj) => obj.parsedQuery.objectName === referencedObjectName
        );

        if (referencedObject) {
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const targetField = object.parsedQuery.fieldMapping.get(sourceField) || sourceField;
          const targetDescribe = object.targetDescribe.fieldsMap.get(targetField) as SObjectFieldDescribe;

          if (targetDescribe.isLookup) {
            // Both source and target fields need to be lookup fields to set the reference mapping

            const targetReferencedObjectName =
              object.targetParsedQuery.polymorphicFieldMapping.get(targetField) ?? targetDescribe.referenceTo?.[0];
            const targetReferencedObject = object.objectSet.objects.find(
              (obj) => obj.targetParsedQuery.objectName === targetReferencedObjectName
            );

            if (targetReferencedObject) {
              const __rField = `${DataMoveUtils.getRField(sourceField)}.${referencedObject.externalId}`;
              // eslint-disable-next-line camelcase
              const target__rField = `${DataMoveUtils.getRField(targetField)}.${targetReferencedObject.externalId}`;
              const referenceField: ReferenceFieldData = {
                field: sourceField,
                sourceReferenceField: {
                  referencedObjectName, // "Account__c"
                  referencedObject, // object of Account__c
                  __rField, // "Account__r.Name"
                  field: sourceField, // "Account__c"
                  fieldDescribe: describe, // describe of "Account__c"
                  referencedExternalId: referencedObject.externalId, // "Name"
                },
                targetReferenceField: {
                  referencedObjectName: targetReferencedObjectName, // "TargetAccount__c"
                  referencedObject: targetReferencedObject, // object of TargetAccount__c
                  // eslint-disable-next-line camelcase
                  __rField: target__rField, // "TargetAccount__r.Name"
                  field: targetField, // "TargetAccount__c"
                  fieldDescribe: targetDescribe, // describe of "TargetAccount__c"
                  referencedExternalId: targetReferencedObject.externalId, // "Name"
                },
              };

              // Add to the object parsed query referenced fields map --
              object.parsedQuery.referencedFieldsMap.set(sourceField, referenceField);
            }
            // End of if (targetReferencedObject)
          }
          // End of if (targetDescribe.isLookup)
        }
        // End of if (referencedObject)
      }
      // End of for loop
    }
  }

  /**
   *  Adds a new referenced object to the object set.
   * @param object  The object to add the referenced object to.
   * @param referencedObjectName  The name of the referenced object to add.
   * @param useSourceConnection  A flag indicating whether to use the source connection.
   */
  public async addReferencedObjectAsync(
    object: ScriptObject,
    referencedObjectName: string,
    useSourceConnection?: boolean
  ): Promise<void> {
    const comUtils = new CommandUtils(this.command);
    const connectionLabel = useSourceConnection
      ? this.command.sourceConnectionLabel
      : this.command.targetConnectionLabel;
    const objectName = useSourceConnection ? object.parsedQuery.objectName : object.targetParsedQuery.objectName;
    comUtils.logCommandMessage(
      'process.added-new-referenced-object',
      object.objectSet.index.toString(),
      objectName,
      connectionLabel,
      referencedObjectName
    );
    // Add this object to object set with readonly operation, Id field and default external id
    const referencedObject = new ScriptObject({
      query: `SELECT Id FROM ${referencedObjectName}`,
      operation: OPERATION.Readonly,
      externalId: undefined, // Use the default external id in setupObject()
      objectSet: object.objectSet,
      isForTargetOnly: !useSourceConnection, // Don't process this object for source connection
    });
    // Initialize the object
    this.initObject(referencedObject, object.objectSet);
    // Add the object to the object set
    object.objectSet.objects.push(referencedObject);
    // Describe the object
    // eslint-disable-next-line no-await-in-loop
    await this.describeObjectAsync(referencedObject);
    this.setupObject(referencedObject);
  }

  /**
   *  Applies the multiselect fields to the object fields.
   * @param object  The object to apply the multiselect fields.
   */
  public applyMultiselectFields(object: ScriptObject): void {
    const comUtils = new CommandUtils(this.command);

    comUtils.logCommandMessage(
      'process.applying-multiselect-fields',
      object.objectSet.index.toString(),
      object.parsedQuery.objectName
    );

    const describe =
      this.command.sourceDataOriginType === DataOriginType.org ? object.sourceDescribe : object.targetDescribe;

    object.parsedQuery.fields = object.parsedQuery.fields
      .map((field: string) => {
        // Apply the 'all' keyword
        if (field === Constants.DATA_MOVE_CONSTANTS.ALL_FIELDS_KEYWORD) {
          return describe.fields.map((f) => f.name);
        }
        // Apply the filter by field describe properties
        if (field.endsWith('_true') || field.endsWith('_false')) {
          const sObjectFieldKeyToEvaluate = field
            .replace('_true', '')
            .replace('_false', '') as keyof SObjectFieldDescribe;
          return describe.fields
            .filter((describeField) => describeField[sObjectFieldKeyToEvaluate] === field.endsWith('_true'))
            .map((f) => f.name);
        }
        return field;
      })
      .flat();
  }

  /**
   *  Gets the default external ID for the given object name according to the metadata.
   * @param objectName  The object name to get its default external ID.
   * @param useSourceConnection  A flag indicating whether to use the source connection.
   * @returns  The default external ID.
   */
  public getDefaultExternalId(objectName: string, useSourceConnection?: boolean, useConstantOnly?: boolean): string {
    if (Constants.DATA_MOVE_CONSTANTS.DEFAULT_EXTERNAL_ID.get(objectName)) {
      return Constants.DATA_MOVE_CONSTANTS.DEFAULT_EXTERNAL_ID.get(objectName) as string;
    }
    if (useConstantOnly) {
      return 'Id';
    }

    const metadata = useSourceConnection
      ? (this.sourceSObjectDescribeMap.get(objectName) as SObjectDescribe)
      : (this.targetSObjectDescribeMap.get(objectName) as SObjectDescribe);

    const externalIdFieldsCandiates = [
      ...metadata.fields.filter((field) => field.nameField),
      ...metadata.fields.filter((field) => field.autoNumber),
      ...metadata.fields.filter((field) => field.unique),
    ];

    if (externalIdFieldsCandiates.length > 0) {
      return externalIdFieldsCandiates[0].name;
    }
    return 'Id';
  }
}
