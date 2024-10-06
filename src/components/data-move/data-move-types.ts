// Enumerations ----------------------------------------------------------------

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

// Types ----------------------------------------------------------------
export type ParsedQuery = {
  /**
   * The fields to select in the query.
   */
  fields: string[];
  /**
   * The object name to query.
   */
  objectName: string;
  /**
   * The where clause of the query.
   */
  where: string;
  /**
   * The limit of the query.
   */
  limit: number;
  /**
   * The offset of the query.
   */
  offset: number;
};
