# summary

Command for importing and exporting data between Salesforce organizations and CSV files, with support for multiple related objects, filters, and transformations.

# description

The `data-move` command enables importing and exporting data between Salesforce organizations and CSV files. It supports handling multiple related objects, applying data filters, and transforming values during migration. The command allows transferring entire data sets or specific records based on flexible, user-defined criteria.

# examples

- <%= config.bin %> <%= command.id %> --source-org mySourceOrg
- <%= config.bin %> <%= command.id %> --csv-source --target-org myTargetOrg --config-path path/to/export.json
- <%= config.bin %> <%= command.id %> --source-org mySourceOrg --csv-target --config-path path/to/export.json
- <%= config.bin %> <%= command.id %> --source-org mySourceOrg --target-org myTargetOrg --config-path path/to/export.json
