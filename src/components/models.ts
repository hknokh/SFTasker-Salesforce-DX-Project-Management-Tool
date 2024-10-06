import { Connection, Messages } from '@salesforce/core';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Constants } from './constants.js';
import { DataOriginType, DescribeSObjectResult, Field, SftaskerCommandFlags } from './types.js';

// Command models ----------------------------------------------------------------
/**
 * Base class for all sftasker commands.
 * @template T - The type of the result returned by the run method.
 */
export class SFtaskerCommand<T> extends SfCommand<T> {
  // Public properties ----------------------------------------------------------
  /**
   * The Salesforce organization ID.
   * @type {string}
   */
  public orgId!: string;

  /**
   * The Salesforce organization source ID.
   * @type {string}
   */
  public sourceOrgId!: string;

  /**
   * The Salesforce organization username.
   * @type {string}
   */
  public orgUsername!: string;

  /**
   * The Salesforce organization source username.
   * @type {string}
   */
  public sourceOrgUsername!: string;

  /**
   * The label for the source connection. Typically 'Source'
   * @type {string}
   */
  public sourceConnectionLabel!: string;

  /**
   * The label for the target connection. Typically 'Target'
   * @type {string}
   */
  public targetConnectionLabel!: string;

  /**
   * Messages related to the command execution.
   * @type {Messages<string>}
   */
  public messages!: Messages<string>;

  /**
   * Messages related to the components used in the task.
   * @type {Messages<string>}
   */
  public componentsMessages!: Messages<string>;

  /**
   * The flags used in the command.
   *
   * @type {SftaskerCommandFlags}
   */
  public flags!: SftaskerCommandFlags;

  /**
   * The source data origin type for the command.
   * @type {DataOriginType}
   */
  public sourceDataOriginType: DataOriginType = DataOriginType.org;

  /**
   * The target data origin type for the command.
   * @type {DataOriginType}
   */
  public targetDataOriginType: DataOriginType = DataOriginType.org;

  // Private properties ---------------------------------------------------------
  private _connection!: Connection;
  private _sourceConnection!: Connection;

  public get connection(): Connection {
    return this._connection;
  }

  public get sourceConnection(): Connection {
    return this._sourceConnection;
  }

  public set connection(value: Connection) {
    this._connection = value;
    if (this._connection) {
      this._connection.metadata.pollTimeout = Constants.POLL_TIMEOUT as number;
      this.orgUsername = this._connection.getUsername() as string;
      this.targetDataOriginType = DataOriginType.org;
    }
  }

  public set sourceConnection(value: Connection) {
    this._sourceConnection = value;
    if (this._sourceConnection) {
      this.sourceOrgUsername = this._sourceConnection.getUsername() as string;
      this.sourceDataOriginType = DataOriginType.org;
    }
  }

  // Command methods ------------------------------------------------------------
  /**
   * Executes the command logic.
   * This method is not yet implemented and will throw an error.
   * @returns {Promise<T>} - A promise resolving to the command's result.
   */
  public run(): Promise<T> {
    this.error('Method not implemented.');
  }
}

// Metadata models ----------------------------------------------------------------
/**
 * Wrapper class to hold SObject field describe properties.
 */
export class SObjectFieldDescribe {
  public name: string;
  public label: string;
  public type: string;
  public length?: number;
  public precision?: number;
  public scale?: number;
  public nillable: boolean;
  public defaultedOnCreate: boolean;
  public calculated: boolean;
  public filterable: boolean;
  public sortable: boolean;
  public updateable: boolean;
  public createable: boolean;
  public unique: boolean;
  public caseSensitive?: boolean;
  public restrictedPicklist?: boolean;
  public picklistValues?: any[];
  public referenceTo?: string[];
  public nameField?: boolean;
  public autoNumber?: boolean;
  public isPolymorphic: boolean;
  public readonly: boolean = false;
  public isFormula: boolean = false;

  public constructor(fieldDescribe: Field) {
    this.name = fieldDescribe.name;
    this.label = fieldDescribe.label;
    this.type = fieldDescribe.type;
    this.length = fieldDescribe.length;
    this.precision = fieldDescribe.precision;
    this.scale = fieldDescribe.scale;
    this.nillable = fieldDescribe.nillable;
    this.defaultedOnCreate = fieldDescribe.defaultedOnCreate;
    this.calculated = fieldDescribe.calculated;
    this.filterable = fieldDescribe.filterable;
    this.sortable = fieldDescribe.sortable;
    this.updateable = fieldDescribe.updateable;
    this.createable = fieldDescribe.createable;
    this.unique = fieldDescribe.unique;
    this.caseSensitive = fieldDescribe.caseSensitive;
    this.restrictedPicklist = fieldDescribe.restrictedPicklist;
    this.picklistValues = fieldDescribe.picklistValues;
    this.referenceTo = fieldDescribe.referenceTo;
    this.nameField = fieldDescribe.nameField;
    this.autoNumber = fieldDescribe.autoNumber;
    this.isPolymorphic = Array.isArray(fieldDescribe.referenceTo) && fieldDescribe.referenceTo.length > 1;
    this.readonly = !fieldDescribe.createable;
    this.isFormula = fieldDescribe.calculated;
  }
}

/**
 * Wrapper class to hold SObject describe properties.
 */
export class SObjectDescribe {
  public name: string;
  public label: string;
  public custom: boolean;
  public keyPrefix: string;
  public fields: SObjectFieldDescribe[];
  public fieldsMap: Map<string, SObjectFieldDescribe> = new Map<string, SObjectFieldDescribe>();

  public constructor(sobjectDescribe: DescribeSObjectResult) {
    this.name = sobjectDescribe.name;
    this.label = sobjectDescribe.label;
    this.custom = sobjectDescribe.custom;
    this.keyPrefix = sobjectDescribe.keyPrefix;
    this.fields = sobjectDescribe.fields.map((field: Field) => {
      const describe = new SObjectFieldDescribe(field);
      this.fieldsMap.set(describe.name, describe);
      return describe;
    });
  }
}
