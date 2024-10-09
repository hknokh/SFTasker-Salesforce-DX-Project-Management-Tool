# summary

Command for importing and exporting data between Salesforce organizations and CSV files, with support for multiple related objects, filters, and transformations.

# description

The `data-move` command enables importing and exporting data between Salesforce organizations and CSV files. It supports handling multiple related objects, applying data filters, and transforming values during migration. The command allows transferring entire data sets or specific records based on flexible, user-defined criteria.

# examples

- <%= config.bin %> <%= command.id %> --source-org mySourceOrg
- <%= config.bin %> <%= command.id %> --csv-source --target-org myTargetOrg --config-path path/to/export.json
- <%= config.bin %> <%= command.id %> --source-org mySourceOrg --csv-target --config-path path/to/export.json
- <%= config.bin %> <%= command.id %> --source-org mySourceOrg --target-org myTargetOrg --config-path path/to/export.json

# process.loading-configuration-file

Loading script file %s...

# process.setting-up-object

[Object-Set #%s : %s] Setting up object...

# process.setting-up-object-set

[Object-Set #%s] Setting up object set...

# process.excluding-object

[Object-Set #%s : %s] Object set #%s: excluding object '%s' from the process...

# process.verifying-query-fields

[Object-Set #%s : %s] Verifying query fields...

# process.describing-object

[Object-Set #%s : %s : %s] Describing object...

# process.mapping-fields

[Object-Set #%s : %s] Mapping fields...

# process.applying-multiselect-fields

[Object-Set #%s : %s] Applying multi-select fields...

# process.field-not-found-in-describe

[WARN: Object-Set #%s : %s : %s] Field '%s' not found in describe...

# process.processing-lookup-fields

[Object-Set #%s : %s] Processing lookup fields...

# process.added-new-referenced-object

[Object-Set #%s : %s : %s] Added a new referenced object '%s'...

# process.setting-default-external-id

[Object-Set #%s : %s] Setting default external ID field: '%s'...

# process.processing-object-dependencies

[Object-Set #%s : %s] Processing object dependencies...

# error.complex-external-id-field-not-found-in-metadata

[Object-Set #%s : %s : %s] Field '%s' as a part of complex external ID field '%s' not found in metadata.
