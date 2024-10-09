// Enumerations ----------------------------------------------------------------

import { SObjectFieldDescribe } from '../models.js';
import { ScriptObject } from './data-move-models.js';

/**
 * Enumeration of the types of operations that can be performed on a data
 */
export enum OPERATION {
  Insert = 'Insert',
  Update = 'Update',
  Upsert = 'Upsert',
  Readonly = 'Readonly',
  Delete = 'Delete',
}

export type ReferencedField = {
  field: string; // "Account__c"
  __rField: string; // "Account__r.Name"
  fieldDescribe: SObjectFieldDescribe; // describe of "Account__c"
  referencedExternalId: string; // "Account__c.Name"
  referencedObjectName?: string; // "Account__c"
  referencedObject: ScriptObject; // Account__c
};

export type ReferenceFieldData = {
  field: string; // "Account__c"
  sourceReferenceField?: Partial<ReferencedField>; // "Account__c.Name"
  targetReferenceField?: Partial<ReferencedField>; // "Account__r.Name"
};
