/* eslint-disable no-param-reassign */
import fs from 'node:fs';
import { Utils } from '../utils.js';
import { CommandUtils } from '../command-utils.js';
import { DataOriginType } from '../types.js';
import { MetadataUtils } from '../metadata-utils.js';
import { SFtaskerCommand, SObjectDescribe } from '../models.js';
import { Constants } from '../constants.js';
import { Script, ScriptObject, ScriptObjectSet } from './data-move-models.js';
import { OPERATION, ParsedQuery } from './data-move-types.js';

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
    let fields: string[] = [];
    let object = '';
    let where = '';
    let limit = 0;
    let offset = 0;

    // Extract fields and object
    const selectFromMatch = queryString.match(/SELECT\s+(.*?)\s+FROM\s+([^\s]+)(?:\s+|$)/i);
    if (selectFromMatch) {
      fields = selectFromMatch[1].split(',').map((field) => field.trim());
      object = selectFromMatch[2];
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

    return { fields, objectName: object, where, limit, offset };
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
          // Assign the object set to the object
          object.objectSet = objectSet;
          // Setup the object
          this.setupScriptObject(object);
        });
      });
    } else {
      comUtils.throwError('error.config-file-not-found', configPath);
    }
  }

  public setupScriptObject(object: ScriptObject): void {
    const comUtils = new CommandUtils(this.command);

    // Parse the query string
    object.parsedQuery = DataMoveUtils.parseQueryString(object.query);

    comUtils.logCommandMessage(
      'process.setting-up-configuration-object',
      object.objectSet.index.toString(),
      object.parsedQuery.objectName
    );

    // Include the Id field if not present
    if (!object.parsedQuery.fields.includes('Id')) {
      object.parsedQuery.fields.unshift('Id');
    }

    // Setup external id field
    object.externalId = object.externalId || 'Id';

    if (object.operation === OPERATION.Insert) {
      // Always use Id as external id for insert operations
      object.externalId = 'Id';
    }
    comUtils.logCommandMessage(
      'process.setting-up-external-id',
      object.objectSet.index.toString(),
      object.parsedQuery.objectName,
      object.externalId
    );

    // Include external id fields in the query fields
    comUtils.logCommandMessage(
      'process.adding-external-id-fields',
      object.objectSet.index.toString(),
      object.parsedQuery.objectName,
      object.externalId
    );
    if (object.externalId) {
      object.externalId.split(Constants.DATA_MOVE_CONSTANTS.COMPLEX_EXTERNAL_ID_SEPARATOR).forEach((field) => {
        if (!object.parsedQuery.fields.includes(field)) {
          object.parsedQuery.fields.push(field);
        }
      });
    }

    comUtils.logCommandMessage(
      'process.verifying-query-fields',
      object.objectSet.index.toString(),
      object.parsedQuery.objectName
    );

    // Filter out excluded fields
    object.parsedQuery.fields = object.parsedQuery.fields.filter((field) => {
      let excluded = Constants.DATA_MOVE_CONSTANTS.EXCLUDED_FIELDS.get(object.parsedQuery.objectName)?.includes(field); // Exclude uneligible fields
      excluded ||= object.excludedFields?.includes(field); // Exclude fields marked as excluded
      return !excluded;
    });

    // Make query fields unique
    object.parsedQuery.fields = Utils.distinctStringArray(object.parsedQuery.fields);
  }

  /**
   *  Describe all objects for the given object set against the source and target orgs.
   * @param objectSet  The object set to describe its sobjects.
   * @returns
   */
  public async describeSourceAndTargetSObjectsAsync(objectSet: ScriptObjectSet): Promise<void> {
    if (!objectSet) {
      return;
    }

    //const comUtils = new CommandUtils(this.command);
    const metaUtils = new MetadataUtils(this.command, this.tempDir);

    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < objectSet.objects.length; i++) {
      const object = objectSet.objects[i];

      // Describibg the source object
      if (this.command.sourceDataOriginType === DataOriginType.org) {
        if (!this.sourceSObjectDescribeMap.has(object.parsedQuery.objectName)) {
          // eslint-disable-next-line no-await-in-loop
          const sourceDescribe = await metaUtils.getSObjectMetadataAsync(object.parsedQuery.objectName, true);
          this.sourceSObjectDescribeMap.set(object.parsedQuery.objectName, sourceDescribe);
        }
      }

      // Describing the target object
      if (this.command.targetDataOriginType === DataOriginType.org) {
        if (!this.targetSObjectDescribeMap.has(object.parsedQuery.objectName)) {
          // eslint-disable-next-line no-await-in-loop
          const targetDescribe = await metaUtils.getSObjectMetadataAsync(object.parsedQuery.objectName, false);
          this.targetSObjectDescribeMap.set(object.parsedQuery.objectName, targetDescribe);
        }
      }
    }
  }

  /**
   *  Gets the default external ID for the given object name according to the metadata.
   * @param objectName  The object name to get its default external ID.
   * @param useSourceConnection  A flag indicating whether to use the source connection.
   * @returns  The default external ID.
   */
  public getDefaultExternalId(objectName: string, useSourceConnection?: boolean): string {
    const metadata = useSourceConnection
      ? (this.sourceSObjectDescribeMap.get(objectName) as SObjectDescribe)
      : (this.targetSObjectDescribeMap.get(objectName) as SObjectDescribe);

    if (Constants.DATA_MOVE_CONSTANTS.DEFAULT_EXTERNAL_IDS.get(objectName)) {
      return Constants.DATA_MOVE_CONSTANTS.DEFAULT_EXTERNAL_IDS.get(objectName) as string;
    }
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
