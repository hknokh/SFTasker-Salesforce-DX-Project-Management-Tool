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

[WARN: Object-Set #%s] Excluding object '%s' from the process...

# process.describing-object

[Object-Set #%s : %s : %s] Describing object...

# process.field-not-found-in-metadata-or-readonly

[WARN: Object-Set #%s : %s : %s] Field '%s' not found in metadata or is read-only. Skipping...

# process.skipping-lookup-field-referenced-object-excluded

[WARN: Object-Set #%s : %s] Lookup field '%s' references an excluded object '%s'. Skipping...

# process.added-new-referenced-object

[Object-Set #%s : %s] Added a new referenced object '%s'...

# process.setting-external-id

[Object-Set #%s : %s] Setting external ID field to '%s'...

# process.processing-object-dependencies

[Object-Set #%s : %s] Processing object dependencies...

# error.external-id-field-not-found-in-metadata

[Object-Set #%s : %s] External ID field '%s' not found in metadata...

# process.processing-object

[Object-Set #%s : %s] Processing object...

# process.post-processing-object

[Object-Set #%s : %s] Post-processing object...

# process.processing-object-set-configurations

Processing %s object set configurations...
