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

[Object-Set #%s] [NOTE] Excluding object '%s' from the process...

# process.field-not-found-in-metadata-or-readonly

[Object-Set #%s : %s : %s] [NOTE] Field '%s' not found in metadata or is read-only. Skipping...

# process.skipping-lookup-field-referenced-object-excluded

[Object-Set #%s : %s] [NOTE] Lookup field '%s' references an excluded object '%s'. Skipping...

# process.added-new-referenced-object

[Object-Set #%s : %s] Added a new referenced object '%s'...

# process.setting-external-id

[Object-Set #%s : %s] Setting external ID field to '%s'...

# process.processing-object-dependencies

[Object-Set #%s : %s] Processing object dependencies...

# error.external-id-field-not-found-in-metadata

[Object-Set #%s : %s] External ID field '%s' not found in metadata...

# process.processing-object-set-configurations

Processing %s object set configurations...

# process.including-multiselect-fields

[Object-Set #%s : %s] Including multi-select fields...

# process.excluding-fields

[Object-Set #%s : %s] Determining fields to exclude...

# process.mapping-object-fields

[Object-Set #%s : %s] Mapping object fields...

# error.missing-object-in-metadata

[Object-Set #%s : %s] Object '%s' not found in metadata...