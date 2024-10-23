# summary

Command for importing and exporting data between Salesforce organizations and CSV files, with support for multiple related objects, filters, and transformations.

# description

The `data-move` command enables importing and exporting data between Salesforce organizations and CSV files. It supports handling multiple related objects, applying data filters, and transforming values during migration. The command allows transferring entire data sets or specific records based on flexible, user-defined criteria.

# examples

- `<%= config.bin %> <%= command.id %> --source-org mySourceOrg`
- `<%= config.bin %> <%= command.id %> --csv-source --target-org myTargetOrg --config-path path/to/export.json`
- `<%= config.bin %> <%= command.id %> --source-org mySourceOrg --csv-target --config-path path/to/export.json`
- `<%= config.bin %> <%= command.id %> --source-org mySourceOrg --target-org myTargetOrg --config-path path/to/export.json`

# process.prepare-command-stage

\n\n=== Script: Preparing command... ===\n

# process.create-object-order-stage

\n\n=== Object Set #%s: Creating object order... ===\n

# process.count-total-records-stage

\n\n=== Object Set #%s: Counting total records... ===\n

# process.delete-records-stage

\n\n=== Object Set #%s: Deleting records... ===\n

# process.query-master-objects-stage

\n\n=== Object Set #%s: Querying master objects from the %s... ===\n

# process.query-source-child-objects-stage

\n\n=== Object Set #%s: Querying source child objects... ===\n

# process.query-target-child-objects-stage

\n\n=== Object Set #%s: Querying target child objects... ===\n

# process.query-source-child-objects-attempt

\n--- Object Set #%s : Attempt #%s: Querying source child objects... --- \n

# process.loading-configuration-file

Loading script file %s...

# process.setting-up-object

[Object-Set #%s : %s] Setting up object...

# process.setting-up-object-set

[Object-Set #%s] Setting up object set...

# process.excluding-object

[Object-Set #%s] [NOTE] Excluding object '%s' from the process...

# process.excluding-object-duplicate-object-name

[Object-Set #%s] [NOTE] Excluding object '%s' from the process due to duplicate object name...

# process.field-not-found-in-metadata-or-readonly

[Object-Set #%s : %s : %s] [NOTE] Field '%s' not found in metadata or is read-only. Excluded...

# process.skipping-lookup-field-referenced-object-excluded

[Object-Set #%s : %s] [NOTE] Lookup field '%s' references an excluded object '%s'. Excluded...

# process.skipping-lookup-field-referencing-mapped-object-not-in-object-set

[Object-Set #%s : %s] [NOTE] Lookup field '%s' references object '%s', which is the mapped target of '%s' but not in the Object Set. Excluded...

# process.added-new-referenced-object

[Object-Set #%s : %s] Added a new referenced object '%s'...

# process.setting-external-id

[Object-Set #%s : %s] Setting external ID field to '%s'...

# process.processing-object-dependencies

[Object-Set #%s : %s] Processing object dependencies...

# process.processing-object-set-configurations

Processing %s object set configurations...

# process.including-multiselect-fields

[Object-Set #%s : %s] Including multi-select fields...

# process.excluding-fields

[Object-Set #%s : %s] Determining fields to exclude...

# process.mapping-object-fields

[Object-Set #%s : %s] Mapping object fields...

# process.creating-object-process-order

[Object-Set #%s] Creating object process order...

# process.object-order-for-update

[Object-Set #%s] Object order for update: %s

# process.object-order-for-delete

[Object-Set #%s] Object order for delete: %s

# process.counting-total-records

[Object-Set #%s : %s : %s] Counting total records...

# process.counting-total-records-for-delete

[Object-Set #%s : %s : %s] Counting total records for delete...

# process.total-records-counted

[Object-Set #%s : %s : %s] Total records counted: %s

# process.total-records-delete-counted

[Object-Set #%s : %s : %s] Total records for delete counted: %s

# process.no-objects-to-delete

[Object-Set #%s] No objects to delete...

# process.deleting-records

[Object-Set #%s] Deleting records...

# process.object-set-to-master

[Object-Set #%s : %s] [NOTE] Object `%s` has been set to `master`...

# error.external-id-field-not-found-in-metadata

[Object-Set #%s : %s] External ID field '%s' not found in metadata...

# error.delete-query-object-mismatch

[Object-Set #%s : %s] Delete query object mismatch. Expected '%s', found '%s'...

# error.delete-query-missing-delete-old-data-and-update-operation

[Object-Set #%s : %s] Delete query should be specified when operation is `Update` and `deleteOldData` is `true`...

# error.missing-object-in-metadata

[Object-Set #%s : %s] Object '%s' not found in metadata...

# error.lookup-field-referenced-object-delete-operation

[Object-Set #%s : %s] Lookup field '%s' references an object that has a delete operation: '%s'.

# progress.querying-records-progress

[Object-Set #%s : %s : %s : %s] Polling... Total records queried: %d

# progress.updating-records-progress

[Object-Set #%s : %s : %s : %s : %s : %s] Polling... State: %s. Succeeded records: %d. Failed records: %d
