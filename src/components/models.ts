import { Connection, Messages } from '@salesforce/core';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Constants } from './constants.js';
import { DataOriginType, DescribeSObjectResult, Field, SftaskerCommandFlags } from './types.js';

// Command models ----------------------------------------------------------------
/**
 * Base class for all sftasker commands.
 * @template T The type of the result returned by the run method.
 */
export class SFtaskerCommand<T> extends SfCommand<T> {
  // Public properties ----------------------------------------------------------
  /** The Salesforce organization ID. */
  public orgId!: string;

  /** The Salesforce organization source ID. */
  public sourceOrgId!: string;

  /** The Salesforce organization username. */
  public orgUsername!: string;

  /** The Salesforce organization source username. */
  public sourceOrgUsername!: string;

  /** The label for the source connection. Typically 'Source'. */
  public sourceConnectionLabel!: string;

  /** The label for the target connection. Typically 'Target'. */
  public targetConnectionLabel!: string;

  /** Messages related to the command execution. */
  public messages!: Messages<string>;

  /** Messages related to the components used in the task. */
  public componentsMessages!: Messages<string>;

  /** The flags used in the command. */
  public flags!: SftaskerCommandFlags;

  /** The source data origin type for the command. */
  public sourceDataOriginType: DataOriginType = DataOriginType.org;

  /** The target data origin type for the command. */
  public targetDataOriginType: DataOriginType = DataOriginType.org;

  // Private properties ---------------------------------------------------------
  /** The Salesforce connection. */
  private _connection!: Connection;

  /** The Salesforce source connection. */
  private _sourceConnection!: Connection;

  /** The Salesforce connection getter. */
  public get connection(): Connection {
    return this._connection;
  }

  /** The Salesforce source connection getter. */
  public get sourceConnection(): Connection {
    return this._sourceConnection;
  }

  /** The Salesforce connection setter. */
  public set connection(value: Connection) {
    this._connection = value;
    if (this._connection) {
      this._connection.metadata.pollTimeout = Constants.POLL_TIMEOUT as number;
      this.orgUsername = this._connection.getUsername() as string;
      this.targetDataOriginType = DataOriginType.org;
    }
  }

  /** The Salesforce source connection setter. */
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
   * @returns A promise resolving to the command's result.
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
  /** The name of the field. */
  public name: string;

  /** The label of the field. */
  public label: string;

  /** The data type of the field. */
  public type: string;

  /** The length of the field. */
  public length?: number;

  /** The precision of the field. */
  public precision?: number;

  /** The scale of the field. */
  public scale?: number;

  /** Indicates if the field is nillable. */
  public nillable: boolean;

  /** Indicates if the field has a default value on create. */
  public defaultedOnCreate: boolean;

  /** Indicates if the field is calculated. */
  public calculated: boolean;

  /** Indicates if the field is filterable. */
  public filterable: boolean;

  /** Indicates if the field is sortable. */
  public sortable: boolean;

  /** Indicates if the field is updateable. */
  public updateable: boolean;

  /** Indicates if the field is createable. */
  public createable: boolean;

  /** Indicates if the field is unique. */
  public unique: boolean;

  /** Indicates if the field is case-sensitive. */
  public caseSensitive?: boolean;

  /** Indicates if the field is a restricted picklist. */
  public restrictedPicklist?: boolean;

  /** The picklist values for the field. */
  public picklistValues?: any[];

  /** The sObjects that the field references. */
  public referenceTo?: string[];

  /** Indicates if the field is a name field. */
  public nameField?: boolean;

  /** Indicates if the field is an auto-number field. */
  public autoNumber?: boolean;

  /** Indicates if the field is polymorphic. */
  public isPolymorphic: boolean;

  /** Indicates if the field is read-only. */
  public readonly: boolean = false;

  /** Indicates if the field is a formula. */
  public isFormula: boolean = false;

  /** Indicates if the field is a lookup. */
  public isLookup: boolean = false;

  /** Indicates if the field supports cascade delete. */
  public cascadeDelete?: boolean = false;

  /** The referenced object type, if applicable. */
  public referencedObjectType?: string;

  /**
   * Creates an instance of SObjectFieldDescribe.
   * @param fieldDescribe The field describe properties.
   */
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
    this.isLookup = Array.isArray(fieldDescribe.referenceTo) && fieldDescribe.referenceTo.length > 0;
    this.cascadeDelete = fieldDescribe.cascadeDelete;
    this.referencedObjectType = fieldDescribe.referenceTo ? fieldDescribe.referenceTo[0] : undefined;
  }

  /**
   * Returns true if the field is a master-detail field.
   * @readonly
   */
  public get isMasterDetail(): boolean {
    return this.isLookup && ((!this.updateable || this.cascadeDelete) as boolean);
  }
}

/**
 * Wrapper class to hold SObject describe properties.
 */
export class SObjectDescribe {
  /** The name of the sObject. */
  public name: string;

  /** The label of the sObject. */
  public label: string;

  /** Indicates if the sObject is custom. */
  public custom: boolean;

  /** The key prefix for the sObject. */
  public keyPrefix: string;

  /** The fields of the sObject. */
  public fields: SObjectFieldDescribe[];

  /** A map of field names to field describe properties. */
  public fieldsMap: Map<string, SObjectFieldDescribe> = new Map<string, SObjectFieldDescribe>();

  /**
   * Creates an instance of SObjectDescribe.
   * @param sobjectDescribe The sObject describe properties.
   */
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
